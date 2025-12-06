const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const db = require('./utils/db');
const { findVerifiedEmail } = require('./utils/email-finder');
const { qualifyProspect } = require('./utils/prospect-qualifier');
const { generateOutreach } = require('./utils/outreach-templates');
const { scrapeFundingNews } = require('./utils/rss-scraper');

// Lazy initialization to prevent 404 when API keys are missing
let anthropic, openai, perplexity;

function getAIClients() {
  if (!anthropic && process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  if (!openai && process.env.OPEN_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPEN_API_KEY,
    });
  }

  if (!perplexity && process.env.PERPLEXITY_API_KEY) {
    perplexity = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai'
    });
  }

  return { anthropic, openai, perplexity };
}

// AI provider fallback - tries Perplexity first (main), then OpenAI, then Claude
async function callAIWithFallback(prompt, maxTokens = 2000) {
  const { anthropic, openai, perplexity } = getAIClients();

  const providers = [
    {
      name: 'Perplexity',
      enabled: !!perplexity,
      call: async () => {
        const response = await perplexity.chat.completions.create({
          model: 'sonar-pro',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        });
        return response.choices[0].message.content;
      }
    },
    {
      name: 'OpenAI',
      enabled: !!openai,
      call: async () => {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        });
        return response.choices[0].message.content;
      }
    },
    {
      name: 'Claude',
      enabled: !!anthropic,
      call: async () => {
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        });
        return response.content[0].text;
      }
    }
  ];

  for (const provider of providers.filter(p => p.enabled)) {
    try {
      console.log(`[AI] Trying ${provider.name}...`);
      const result = await provider.call();
      console.log(`[AI] ✓ ${provider.name} succeeded`);
      return result;
    } catch (error) {
      console.error(`[AI] ✗ ${provider.name} failed:`, error.message);
      // Continue to next provider
    }
  }

  throw new Error('All AI providers failed or no API keys configured');
}

/**
 * WEB PROSPECTING & INTENT SIGNAL DETECTION
 * Finds high-intent prospects across the web actively seeking growth consulting
 */

// High-intent buyer signals for strategic consulting
const BUYER_INTENT_SIGNALS = {
  organizational_changes: [
    'hired new CEO',
    'new leadership team',
    'executive promotion',
    'expanding operations',
    'opening new office',
    'series A funding',
    'series B funding',
    'acquisition announcement',
    'merger announcement'
  ],
  growth_indicators: [
    'scaling business',
    'rapid growth',
    'expanding team',
    'hiring surge',
    'revenue milestone',
    'market expansion',
    'new product launch',
    'international expansion'
  ],
  pain_points: [
    'operational inefficiency',
    'need strategic planning',
    'scaling challenges',
    'growth bottleneck',
    'organizational restructure',
    'process improvement needed',
    'need business consultant',
    'seeking strategic advisor'
  ],
  online_behaviors: [
    'downloading business growth guides',
    'attending business strategy webinars',
    'reading scaling articles',
    'engaging with consulting content',
    'visiting competitor websites',
    'searching for consultants'
  ]
};

// Web sources to monitor for prospects
const PROSPECTING_SOURCES = {
  news: {
    name: 'Business News & Press Releases',
    sources: ['BusinessWire', 'PR Newswire', 'TechCrunch', 'Business Insider'],
    signals: ['funding', 'expansion', 'leadership changes', 'growth milestones']
  },
  forums: {
    name: 'Business Forums & Communities',
    sources: ['Reddit r/entrepreneur', 'Reddit r/smallbusiness', 'Indie Hackers', 'Quora'],
    signals: ['asking for help', 'seeking advice', 'growth challenges']
  },
  job_boards: {
    name: 'Job Postings',
    sources: ['LinkedIn Jobs', 'Indeed', 'Glassdoor'],
    signals: ['hiring VP Operations', 'hiring COO', 'expanding team', 'strategic roles']
  },
  review_sites: {
    name: 'Review & Intent Platforms',
    sources: ['G2', 'Capterra', 'GetApp'],
    signals: ['researching consulting services', 'comparing consultants']
  },
  social_media: {
    name: 'Social Media Monitoring',
    sources: ['Twitter/X', 'LinkedIn Posts', 'Facebook Groups'],
    signals: ['business growth posts', 'scaling challenges', 'seeking recommendations']
  }
};

module.exports = async (req, res) => {
  // CORS headers
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://maggieforbesstrategies.com',
    'https://www.maggieforbesstrategies.com',
    'http://localhost:3000'
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    if (req.method === 'GET') {
      // Return prospecting configuration and stats
      const stats = await getWebProspectingStats(tenantId);

      return res.status(200).json({
        success: true,
        intentSignals: BUYER_INTENT_SIGNALS,
        sources: PROSPECTING_SOURCES,
        stats
      });
    }

    if (req.method === 'POST') {
      const { action, data, skipEmailEnrichment } = req.body;

      switch (action) {
        case 'scan_web':
          const prospects = await scanWebForProspects(data, tenantId, req, skipEmailEnrichment);
          return res.status(200).json({ success: true, prospects });

        case 'enrich_email':
          // Enrich a single contact's email
          const { contactId, contactPerson, companyName, companyDomain } = data;
          if (!contactId || !contactPerson || !companyName) {
            return res.status(400).json({ error: 'Missing required fields: contactId, contactPerson, companyName' });
          }

          const enrichmentResult = await enrichEmail(contactPerson, companyName, companyDomain);

          // Update contact in database
          await db.queryOne(
            'UPDATE contacts SET email = $1, notes = CONCAT(notes, $2), updated_at = $3 WHERE id = $4 AND tenant_id = $5 RETURNING *',
            [
              enrichmentResult.email,
              `\n\n📧 Email Enriched: ${enrichmentResult.email}\nSource: ${enrichmentResult.source}\nConfidence: ${enrichmentResult.confidence}%\nDate: ${new Date().toISOString()}`,
              new Date(),
              contactId,
              tenantId
            ]
          );

          return res.status(200).json({ success: true, enrichment: enrichmentResult });

        default:
          return res.status(400).json({ error: 'Invalid action. Supported: scan_web, enrich_email' });
      }
    }

  } catch (error) {
    console.error('[Web Prospector] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Find prospects who are ACTIVELY ASKING for help - real intent signals
 */
async function scanWebForProspects(criteria, tenantId, req, skipEmailEnrichment = false) {
  console.log('[Web Prospector] Finding people actively seeking strategic help...');
  if (skipEmailEnrichment) {
    console.log('[Web Prospector] Email enrichment SKIPPED for faster processing');
  }

  let prospects = [];

  try {
    // PHASE 3: Try RSS scraping first (FAST - 2-3 seconds, FREE)
    console.log('[Web Prospector] Trying direct RSS scraping (fast & free)...');
    const rssProspects = await scrapeFundingNews();

    if (rssProspects && rssProspects.length > 0) {
      console.log(`[Web Prospector] ✓ RSS found ${rssProspects.length} prospects - using these (no Perplexity needed!)`);
      prospects = rssProspects;
      // Skip Perplexity entirely - we have prospects!
    } else {
      console.log('[Web Prospector] RSS found no prospects, falling back to Perplexity...');
      // FALLBACK: Use Perplexity only if RSS fails
      const { anthropic, openai, perplexity } = getAIClients();

      if (!perplexity && !anthropic) {
        throw new Error('Both RSS and AI failed - need PERPLEXITY_API_KEY or ANTHROPIC_API_KEY');
      }
    // Search for HIGH-VALUE buying signals using Perplexity Sonar Pro
    if (!perplexity) {
      throw new Error('Perplexity not configured, will use fallback');
    }
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',  // Using sonar instead of sonar-pro for better data extraction
      messages: [{
        role: 'system',
        content: 'You are a business intelligence data extraction assistant. Extract ONLY factual company data from real news sources. Never use examples or placeholders. Always provide real company names, executive names, and verified funding amounts from actual news articles.'
      }, {
        role: 'user',
        content: `Search TechCrunch, Business Insider, and Crunchbase for companies that raised funding or hired executives in the last 60 days.

Find companies with these HIGH-VALUE signals:

1. FUNDING: Series A/B/C/D funding announcements ($5M+)
2. EXECUTIVE HIRING: New C-level executives (CEO, COO, VP Operations, CSO)
3. EXPANSION: Opening new offices, entering new markets, major product launches
4. GROWTH: IPO preparation, rapid team expansion, major partnerships

SOURCES TO CHECK:
- TechCrunch funding announcements
- Business Insider executive moves
- Forbes growth company profiles
- Crunchbase recent funding
- LinkedIn executive hiring posts

REQUIREMENTS:
- Must be REAL companies (publicly verifiable)
- Must have REAL executive names (not "CEO Name" or generic)
- Must include SPECIFIC date and dollar amount if funding
- Must be US-based companies with $5M+ revenue
- Must include source URL for verification

Return ONLY 1-2 REAL companies in this table format:
| Company Name | CEO/Executive | What Happened | Industry |

Example of CORRECT format (with real data):
| Brevo | Armand Thiberge | Raised $583M Series D | Marketing Tech |

IMPORTANT: Return ONLY 1-2 companies max. This runs every 10 minutes so we need fast, focused results.
NO placeholders. NO examples. ONLY real companies from actual articles.`
      }],
      return_citations: true
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[Web Prospector] ===== PERPLEXITY SEARCH RESULTS =====');
    console.log(searchResults);
    console.log('[Web Prospector] Citations:', citations.length);
    console.log('[Web Prospector] Response length:', searchResults?.length || 0);
    console.log('[Web Prospector] ===== END SEARCH RESULTS =====');

    // CRITICAL: Only proceed if Perplexity found actual companies
    if (!searchResults || searchResults.length < 50 ||  // Relaxed from 100 to 50
        searchResults.toLowerCase().includes('i cannot') ||
        searchResults.toLowerCase().includes('i don\'t have access') ||
        searchResults.toLowerCase().includes('i can\'t browse')) {
      console.error('[Web Prospector] Perplexity did not return real web search results');
      console.error('[Web Prospector] Response was invalid or too short');
      console.error('[Web Prospector] Response preview:', searchResults?.substring(0, 200));
      return [];
    }

    // Check if we got real companies (look for company indicators)
    const hasCompanies = searchResults.includes('CEO') ||
                        searchResults.includes('acquisition') ||
                        searchResults.includes('funding') ||
                        searchResults.includes('Series') ||
                        citations.length > 0;

    if (!hasCompanies) {
      console.error('[Web Prospector] No company data found in search results');
      return [];
    }

    // Extract company data directly from Perplexity response (FAST - no extra API call)
    // Perplexity returns data in various formats - try table first, then markdown sections

    // prospects already declared at line 213, reuse it here
    prospects = [];

    // METHOD 1: Try parsing markdown table format
    // Format: | **Company Name** | CEO | What Happened | Size/Industry | Why Consulting |
    // Also try: | Company | CEO | Signal (Date) | Size/Industry | Strategic Consulting Need |
    const tableMatch = searchResults.match(/\|\s*Company(?:\s+Name)?\s*\|[\s\S]+?\n\|[-|\s]+\|\n([\s\S]+?)(?:\n\n|$)/i);

    if (tableMatch) {
      const tableRows = tableMatch[1].trim().split('\n');

      for (const row of tableRows) {
        const cells = row.split('|').map(c => c.trim()).filter(c => c);

        if (cells.length >= 3) {
          const companyName = cells[0].replace(/\*\*/g, '').trim();
          const ceo = cells[1].trim();
          const whatHappened = cells[2].trim();
          const industry = cells.length >= 4 ? cells[3].trim() : 'Technology/Business Services';

          // Skip empty or header rows
          if (!companyName || companyName.toLowerCase() === 'company name') continue;

          // If CEO is not disclosed, use placeholder (enrich later to avoid timeout)
          let actualCEO = ceo;
          if (ceo.toLowerCase().includes('not public') ||
              ceo.toLowerCase().includes('not disclosed') ||
              ceo.toLowerCase() === 'not specified' ||
              ceo.toLowerCase().includes('not available')) {
            actualCEO = `CEO - ${companyName}`;
            console.log(`[Web Prospector] ⚠ CEO not specified for ${companyName}, using placeholder (will enrich later)`);
          }

          prospects.push({
            companyName,
            contactPerson: actualCEO,
            recentSignal: whatHappened,
            whereFound: 'Perplexity Web Search',
            intentScore: 85,
            approachAngle: `Strategic consulting for ${whatHappened.toLowerCase().includes('acquisition') ? 'M&A integration' : whatHappened.toLowerCase().includes('funding') ? 'scaling operations' : 'growth strategy'}`,
            industry,
            companySize: '$5M+',
            postUrl: citations[0] || 'https://www.perplexity.ai',
            needsEnrichment: actualCEO.startsWith('CEO -')
          });
        }
      }

      console.log(`[Web Prospector] Extracted ${prospects.length} prospects from table format`);
    }

    // METHOD 2: If table parsing failed, try markdown section patterns
    if (prospects.length === 0) {
      // Pattern 1: ## 1. Company Name - Event\n**Company:** Name
      const pattern1 = /##\s+\d+\.\s+([^\n-]+?)(?:\s*-\s*[^\n]+)?\s*\n+\*\*Company:\*\*\s+([^\n]+)/gi;

      // Pattern 2: ### 1. **Company Name**\n- **CEO:** Name
      const pattern2 = /###\s+\d+\.\s+\*\*([^\n*]+)\*\*\s*\n\s*-\s*\*\*CEO:\*\*\s+([^\n]+)/gi;

      // Pattern 3: ## 1. **Company Name**\n**CEO:** Name
      const pattern3 = /##?\s+\d+\.\s+\*?\*?([^\n*]+)\*?\*?\s*\n\s*\*?\*?CEO:\*?\*?\s+([^\n]+)/gi;

      const patterns = [pattern1, pattern2, pattern3];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(searchResults)) !== null) {
          const companyName = match[1].trim();
          const companyInfo = match[2].trim();

          // Extract signal from the section
          const sectionStart = match.index + match[0].length;
          const nextSectionMatch = searchResults.substring(sectionStart).match(/\n##[#]?\s+\d+\./);
          const sectionEnd = nextSectionMatch ? sectionStart + nextSectionMatch.index : searchResults.length;
          const sectionText = searchResults.substring(sectionStart, sectionEnd);

          const signalMatch = sectionText.match(/\*\*(?:Signal Type|What Happened|Date):\*\*\s+([^\n]+)/i);
          const recentSignal = signalMatch ? signalMatch[1].trim() : sectionText.substring(0, 200).trim();

          const industryMatch = sectionText.match(/\*\*Industry:\*\*\s+([^\n]+)/i);
          const industry = industryMatch ? industryMatch[1].trim() : 'Technology/Business Services';

          prospects.push({
            companyName: companyName.replace(/\*/g, '').trim(),
            contactPerson: companyInfo,
            recentSignal,
            whereFound: 'Perplexity Web Search',
            intentScore: 85,
            approachAngle: `Strategic consulting for ${recentSignal.toLowerCase().includes('acquisition') ? 'M&A integration' : recentSignal.toLowerCase().includes('funding') ? 'scaling operations' : 'growth strategy'}`,
            industry,
            companySize: '$5M+',
            postUrl: citations[0] || 'https://www.perplexity.ai'
          });
        }

        if (prospects.length > 0) {
          console.log(`[Web Prospector] Extracted ${prospects.length} prospects using markdown pattern`);
          break;
        }
      }
    }

    console.log(`[Web Prospector] Fast extraction found ${prospects.length} prospects`);

    // DEBUG: If no prospects found, log the search results format
    if (prospects.length === 0) {
      console.log('[Web Prospector] DEBUG: No prospects extracted from regex');
      console.log('[Web Prospector] First 500 chars:', searchResults.substring(0, 500));

      // FALLBACK: Use Claude to parse whatever format Perplexity returned
      console.log('[Web Prospector] Using Claude to parse Perplexity results...');
      try {
        const parsePrompt = `Parse this list of companies and extract structured data.

${searchResults}

Return ONLY a JSON array like this (no other text):
[
  {
    "companyName": "Company Name",
    "contactPerson": "CEO Name",
    "recentSignal": "What happened (e.g., raised $50M Series B)",
    "industry": "Industry",
    "companySize": "$5M+"
  }
]

If you found companies, return the JSON array. If no companies found, return []`;

        const claudeResponse = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 2000,
          messages: [{ role: 'user', content: parsePrompt }]
        });

        const parsed = claudeResponse.content[0].text.trim();
        console.log('[Web Prospector] Claude parsed response:', parsed.substring(0, 200));

        // Extract JSON array from response (handle markdown code blocks)
        let jsonStr = parsed;
        if (parsed.includes('```')) {
          const match = parsed.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (match) jsonStr = match[1];
        }

        const parsedProspects = JSON.parse(jsonStr);

        if (Array.isArray(parsedProspects) && parsedProspects.length > 0) {
          prospects = parsedProspects.map(p => ({
            companyName: p.companyName,
            contactPerson: p.contactPerson,
            recentSignal: p.recentSignal,
            whereFound: 'Perplexity Web Search',
            intentScore: 85,
            approachAngle: `Strategic consulting for ${p.recentSignal?.toLowerCase().includes('acquisition') ? 'M&A integration' : p.recentSignal?.toLowerCase().includes('funding') ? 'scaling operations' : 'growth strategy'}`,
            industry: p.industry || 'Technology/Business Services',
            companySize: p.companySize || '$5M+',
            postUrl: citations[0] || 'https://www.perplexity.ai'
          }));
          console.log(`[Web Prospector] ✅ Claude extracted ${prospects.length} prospects`);
        }
      } catch (parseError) {
        console.error('[Web Prospector] Claude parsing failed:', parseError.message);
      }
    }

    // Validate: Filter out fake/generic company names - AGGRESSIVE
    const fakePatterns = [
      // Generic tech names
      'TechCorp', 'Solutions LLC', 'Innovations Inc', 'Tech Innovations',
      'FinTech', 'HealthTech', 'EduSmart', 'GreenTech', 'Retail Revolution',
      'TechStartup', 'Tech Startup', 'Generic Inc', 'Digital Solutions',

      // Placeholder names
      'Example Corp', 'Sample Company', 'Company Name', 'Acme Corp',
      'XYZ Corp', 'ABC Company', 'ABC Corp', 'XYZ Inc',

      // Generic business names
      'Business Solutions', 'Consulting Group', 'Services Inc',
      'Partners LLC', 'Ventures Inc', 'Holdings LLC',

      // Common fake patterns
      'Corp Inc', 'LLC Corp', 'Solutions Inc', 'Tech LLC'
    ];

    const genericNames = [
      'CEO', 'Executive', 'Founder', 'Name', 'Person',
      'Jane Doe', 'John Doe', 'John Smith', 'Jane Smith',
      'CEO Name', 'Founder Name', 'Executive Name',
      'Not disclosed', 'Not public', 'Not specified', 'TBD', 'TBA'
    ];

    prospects = prospects.filter(p => {
      const companyName = p.companyName || '';
      const contactPerson = p.contactPerson || '';

      // Check for fake company names (case-insensitive)
      if (fakePatterns.some(fake => companyName.toLowerCase().includes(fake.toLowerCase()))) {
        console.log(`[Web Prospector] ❌ Rejected FAKE COMPANY: ${companyName}`);
        return false;
      }

      // Reject companies that are ONLY generic suffixes
      const onlyGenericSuffix = /^(Tech|Solutions|Innovations|Digital|Services|Consulting|Group|Partners|Ventures|Holdings)\s*(Inc|LLC|Corp|Ltd)?\.?$/i;
      if (onlyGenericSuffix.test(companyName.trim())) {
        console.log(`[Web Prospector] ❌ Rejected GENERIC SUFFIX ONLY: ${companyName}`);
        return false;
      }

      // Check for generic contact names (but allow "CEO - Company" pattern for enrichment)
      if (!contactPerson.startsWith('CEO -') &&
          genericNames.some(generic => contactPerson.toLowerCase().includes(generic.toLowerCase()))) {
        console.log(`[Web Prospector] ❌ Rejected GENERIC NAME: ${contactPerson} at ${companyName}`);
        return false;
      }

      // Require minimum data quality
      if (!companyName || companyName.length < 3) {
        console.log(`[Web Prospector] ❌ Rejected INVALID: Missing company name`);
        return false;
      }

      if (!contactPerson || contactPerson.length < 3) {
        console.log(`[Web Prospector] ❌ Rejected INVALID: Missing contact person for ${companyName}`);
        return false;
      }

      // Reject if contact person is just a title
      if (/^(CEO|COO|CFO|CTO|VP|President|Director|Manager|Executive|Founder)$/i.test(contactPerson.trim())) {
        console.log(`[Web Prospector] ❌ Rejected TITLE ONLY: ${contactPerson} at ${companyName}`);
        return false;
      }

      // Require full name (first and last, at least 2 words), unless it's a placeholder
      if (!contactPerson.startsWith('CEO -')) {
        const nameParts = contactPerson.trim().split(/\s+/);
        if (nameParts.length < 2) {
          console.log(`[Web Prospector] ❌ Rejected INCOMPLETE NAME: ${contactPerson} at ${companyName}`);
          return false;
        }
      }

      console.log(`[Web Prospector] ✓ VALIDATED: ${companyName} - ${contactPerson}`);
      return true;
    });
    }  // Close the else block for Perplexity fallback

  } catch (error) {
    console.error('[Web Prospector] Perplexity search error:', error.message);

    // Fallback: Try OpenAI to search for funding announcements
    try {
      const fallbackResponse = await callAIWithFallback(`Search recent TechCrunch and Business Insider articles for companies that raised Series A, B, or C funding in the last 30 days. Include company names, funding amounts, and CEO names. Focus on companies with $5M+ funding.`, 1500);

      console.log('[Web Prospector] Fallback funding search:', fallbackResponse.substring(0, 300));
    } catch (fallbackError) {
      console.error('[Web Prospector] All search methods failed');
    }
  }

  // Save all prospects to database (both manual and cron calls)
  for (const prospect of prospects) {
    // Extract company name (try multiple field name variations)
    const companyName = prospect.companyName || prospect.company || prospect.Company_Name ||
                        prospect['Company Name'] || prospect.name || 'Unknown Company';

    // Extract contact person (try multiple variations)
    const contactPerson = prospect.contactPerson || prospect.contact || prospect.Contact_Person ||
                          prospect['Contact Person'] || prospect.contactName || null;

    // Extract intent score (ensure it's a number)
    const intentScore = parseInt(prospect.intentScore || prospect.intent_score ||
                                 prospect['Intent Score'] || prospect.score || 0);

    // Extract recent signal
    const recentSignal = prospect.recentSignal || prospect.signal || prospect.Recent_Signal ||
                        prospect['Recent Signal'] || prospect.triggerEvent || 'Growth signal detected';

    // Extract where found
    const whereFound = prospect.whereFound || prospect.where_found || prospect['Where Found'] ||
                      prospect.source || prospect.Source || 'web';

    // Extract approach angle
    const approachAngle = prospect.approachAngle || prospect.approach || prospect.Approach_Angle ||
                         prospect['Approach Angle'] || prospect.recommendation || '';

    // Extract post URL for verification
    const postUrl = prospect.postUrl || prospect.url || prospect.link || prospect.whereFound || '';

    // Extract industry
    const industry = prospect.industry || prospect.Industry || 'Not specified';

    // Determine signal type
    const signalType = recentSignal.toLowerCase().includes('fund') ? 'Funding' :
                      recentSignal.toLowerCase().includes('hired') || recentSignal.toLowerCase().includes('ceo') || recentSignal.toLowerCase().includes('coo') ? 'Executive Hiring' :
                      recentSignal.toLowerCase().includes('expansion') || recentSignal.toLowerCase().includes('new market') ? 'Expansion' :
                      'Growth Signal';

    // Skip if we don't have minimum company name and contact person
    if (companyName === 'Unknown Company' || !contactPerson) {
      console.log('[Web Prospector] ⚠️  Skipping - missing company or contact info');
      continue;
    }

    // Extract email if available, or try to find real email
    let contactEmail = prospect.email || prospect.contactEmail;
    let needsEnrichment = false;
    let emailSource = 'provided';

    // If no email provided, generate placeholder (skip enrichment if requested for speed)
    if (!contactEmail || contactEmail.includes('PLACEHOLDER')) {
      if (skipEmailEnrichment) {
        // Fast mode: just use pattern without verification
        const nameParts = contactPerson.toLowerCase().split(' ').filter(p => p !== '-' && p.toLowerCase() !== 'ceo');
        const firstName = nameParts[0] || 'contact';
        const lastName = nameParts[nameParts.length - 1] || 'lead';

        const companyDomainGuess = companyName.toLowerCase()
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '')
          .replace(/inc|llc|corp|ltd|company|co$/i, '');

        contactEmail = `${firstName}.${lastName}@${companyDomainGuess}.com`;
        needsEnrichment = true;
        emailSource = 'pattern_guess_fast';
        console.log(`[Web Prospector] ⚡ Fast email pattern: ${contactEmail}`);
      } else {
        console.log(`[Web Prospector] 🔍 No email for ${contactPerson} - using self-reliant finder...`);

        // Use our own email discovery (no APIs, no big tech)
        // Pass the source URL so we can scrape the ACTUAL article where they were mentioned
        const emailResult = await findVerifiedEmail(contactPerson, companyName, postUrl);

        if (emailResult && emailResult.email) {
          contactEmail = emailResult.email;
          emailSource = emailResult.source;
          needsEnrichment = !emailResult.verified;

          const verifiedLabel = emailResult.verified ? 'VERIFIED ✓✓' : 'unverified';
          console.log(`[Web Prospector] ✓ Found email via ${emailSource}: ${contactEmail} (${verifiedLabel}, ${emailResult.confidence}% confidence)`);
        } else {
          // Shouldn't happen, but fallback just in case
          const nameParts = contactPerson.toLowerCase().split(' ');
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];

          const companyDomainGuess = companyName.toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/g, '')
            .replace(/inc|llc|corp|ltd|company|co$/i, '');

          contactEmail = `${firstName}.${lastName}@${companyDomainGuess}.com`;
          needsEnrichment = true;
          emailSource = 'fallback_pattern';

          console.log(`[Web Prospector] ⚠️ Fallback email pattern: ${contactEmail}`);
        }
      }
    }

    // Check if we already have this company
    const existingContact = await db.queryOne(
      'SELECT id FROM contacts WHERE company ILIKE $1 AND tenant_id = $2',
      [companyName, tenantId]
    );

    if (!existingContact) {
      // PHASE 3: Rule-based qualification (no AI needed!)
      const qualification = qualifyProspect({
        companyName,
        contactPerson,
        recentSignal,
        industry,
        companySize,
        fundingAmount: recentSignal,
        signalType,
        signalDate: new Date()
      });

      console.log(`[Web Prospector] 🎯 Qualification Score: ${qualification.score}/100 - Priority: ${qualification.priority}`);

      // Generate personalized outreach (no AI needed!)
      const outreach = generateOutreach({
        companyName,
        contactPerson,
        recentSignal,
        industry
      }, qualification);

      console.log(`[Web Prospector] ✉️  Outreach generated - Subject: ${outreach.subject}`);

      // Build notes with enrichment status
      let notes = `💎 HIGH-VALUE PROSPECT ($5M+)\n\nSignal: ${recentSignal}\n\nIndustry: ${industry}\nSource: ${whereFound}\nVerify: ${postUrl}`;

      // Add qualification insights
      notes += `\n\n🎯 QUALIFICATION (Rule-Based - No AI)`;
      notes += `\nScore: ${qualification.score}/100`;
      notes += `\nPriority: ${qualification.priority.toUpperCase()}`;
      notes += `\nQualified: ${qualification.qualified ? 'YES' : 'NO'}`;
      if (qualification.reasons.length > 0) {
        notes += `\n\nReasons:\n${qualification.reasons.map(r => '• ' + r).join('\n')}`;
      }

      // Add pain points
      if (qualification.pain_points.length > 0) {
        notes += `\n\nLikely Pain Points:\n${qualification.pain_points.map(p => '• ' + p).join('\n')}`;
      }

      // Add outreach email
      notes += `\n\n📧 PERSONALIZED OUTREACH (Template-Based)`;
      notes += `\nSubject: ${outreach.subject}`;
      notes += `\n\n${outreach.body}`;

      // Add CEO enrichment status if needed
      if (contactPerson.startsWith('CEO -')) {
        notes += `\n\n🔍 CEO NAME NEEDS ENRICHMENT\nPlaceholder: ${contactPerson}\nAction Required: Find and update actual CEO name\nCompany: ${companyName}`;
      }

      // Add email verification status to notes
      if (emailSource === 'article_extraction') {
        notes += `\n\n✅✅✅ REAL EMAIL (99% Confidence)\nFound: Extracted from source article\nEmail published alongside ${contactPerson}'s name\nNOT a guess - actually found in: ${postUrl}\nMethod: Article scraping`;
      } else if (emailSource === 'website_scrape') {
        notes += `\n\n✅✅ EMAIL VERIFIED (95% Confidence)\nFound: Scraped from company website\nMatched to ${contactPerson}'s name\nMethod: Direct web scraping`;
      } else if (emailSource === 'smtp_verification') {
        notes += `\n\n⚠️ EMAIL PATTERN VERIFIED (85% Confidence)\nMethod: SMTP verified mailbox exists\nNote: Pattern guess, but mailbox confirmed\nRecommend: Verify it's the right person`;
      } else if (emailSource === 'pattern_guess' || emailSource === 'fallback_pattern') {
        notes += `\n\n⚠️⚠️ EMAIL IS A GUESS (30% Confidence)\nGenerated: ${contactEmail}\nMethod: Pattern-based guess\nWARNING: Not verified - DO NOT use for outreach`;
      } else {
        notes += `\n\n✅ EMAIL PROVIDED\nSource: ${emailSource}`;
      }

      const contact = await db.insert('contacts', {
        tenant_id: tenantId,
        full_name: contactPerson,
        email: contactEmail,
        company: companyName,
        stage: 'new',
        lead_source: `high_value_signal_${signalType.toLowerCase().replace(' ', '_')}`,
        notes: notes,
        client_type: 'enterprise_prospect',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Log the buying signal
      await db.insert('contact_activities', {
        tenant_id: tenantId,
        contact_id: contact.id,
        type: 'high_value_buying_signal',
        description: `Signal Type: ${signalType}\nWhat Happened: ${recentSignal}\n\nWhy This Matters: Companies at this stage need strategic consulting to navigate growth successfully.\n\nApproach: ${approachAngle}\n\nSource: ${postUrl}`,
        created_at: new Date()
      });

      console.log(`[Web Prospector] ✓ Saved HIGH-VALUE prospect: ${companyName} - ${signalType}`);
    } else {
      console.log(`[Web Prospector] Skipping duplicate: ${companyName}`);
    }
  }

  return prospects;
}

/**
 * Email Enrichment Function
 * Finds real email addresses for prospects using various strategies
 *
 * Integration options:
 * - Hunter.io API: https://hunter.io/api-documentation/v2
 * - Clearbit API: https://clearbit.com/docs
 * - Apollo.io API: https://apolloio.github.io/apollo-api-docs/
 * - RocketReach API: https://rocketreach.co/api
 */
async function enrichEmail(contactPerson, companyName, companyDomain = null) {
  console.log(`[Email Enrichment] Finding email for ${contactPerson} at ${companyName}`);

  const firstName = contactPerson.split(' ')[0];
  const lastName = contactPerson.split(' ').slice(1).join(' ');

  try {
    // STRATEGY 1: Use Perplexity to search for the executive's email
    const { perplexity } = getAIClients();

    if (perplexity) {
      console.log(`[Email Enrichment] Searching web for ${contactPerson} email...`);

      const searchResponse = await perplexity.chat.completions.create({
        model: 'sonar',
        messages: [{
          role: 'user',
          content: `Find the email address for ${contactPerson} who is an executive at ${companyName}.

Search:
- Company website contact page
- LinkedIn profile
- Press releases and news articles
- Company announcements

Return ONLY the email address if found. If not found, return "NOT_FOUND".
Do not guess or generate emails - only return if you found a real, verified email address.`
        }],
        return_citations: true
      });

      const result = searchResponse.choices[0].message.content.trim();

      // Check if we got a real email (contains @ and domain)
      const emailMatch = result.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);

      if (emailMatch && !result.includes('NOT_FOUND')) {
        const foundEmail = emailMatch[1];
        console.log(`[Email Enrichment] ✓ FOUND real email: ${foundEmail}`);
        return {
          email: foundEmail,
          confidence: 85,
          source: 'perplexity_web_search',
          needsVerification: false
        };
      }
    }

    // STRATEGY 2: Hunter.io API (if configured)
    if (process.env.HUNTER_API_KEY && companyDomain) {
      console.log(`[Email Enrichment] Trying Hunter.io for ${companyDomain}...`);

      const hunterUrl = `https://api.hunter.io/v2/email-finder?domain=${companyDomain}&first_name=${firstName}&last_name=${lastName}&api_key=${process.env.HUNTER_API_KEY}`;
      const response = await fetch(hunterUrl);
      const data = await response.json();

      if (data.data && data.data.email && data.data.score > 70) {
        console.log(`[Email Enrichment] ✓ Hunter.io found: ${data.data.email} (${data.data.score}% confidence)`);
        return {
          email: data.data.email,
          confidence: data.data.score,
          source: 'Hunter.io',
          needsVerification: false
        };
      }
    }

    console.log(`[Email Enrichment] ⚠️ No verified email found, returning null`);
    return null;

  } catch (error) {
    console.error(`[Email Enrichment] Error:`, error.message);
    return null;
  }
}

/**
 * Get web prospecting statistics
 */
async function getWebProspectingStats(tenantId) {
  const stats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE lead_source LIKE 'web_prospector%') as web_prospects,
      COUNT(*) FILTER (WHERE lead_source = 'business_news') as news_prospects,
      COUNT(*) FILTER (WHERE lead_source = 'job_posting_signal') as job_prospects,
      COUNT(*) FILTER (WHERE client_type = 'high_intent_prospect') as high_intent,
      COUNT(*) FILTER (WHERE lead_source LIKE 'web%' AND stage = 'closed_won') as closed_won
    FROM contacts
    WHERE tenant_id = $1
  `, [tenantId]);

  return {
    totalWebProspects: parseInt(stats?.web_prospects || 0) + parseInt(stats?.news_prospects || 0) + parseInt(stats?.job_prospects || 0),
    newsProspects: parseInt(stats?.news_prospects || 0),
    jobSignals: parseInt(stats?.job_prospects || 0),
    highIntent: parseInt(stats?.high_intent || 0),
    closedWon: parseInt(stats?.closed_won || 0)
  };
}
