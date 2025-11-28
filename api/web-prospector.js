const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const db = require('./utils/db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

// Perplexity for web search (uses OpenAI SDK)
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

// AI provider fallback - tries Perplexity first (main), then OpenAI, then Claude
async function callAIWithFallback(prompt, maxTokens = 2000) {
  const providers = [
    {
      name: 'Perplexity',
      call: async () => {
        const response = await perplexity.chat.completions.create({
          model: 'llama-3.1-sonar-large-128k-online',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        });
        return response.choices[0].message.content;
      }
    },
    {
      name: 'OpenAI',
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

  for (const provider of providers) {
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

  throw new Error('All AI providers failed');
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
      const { action, data } = req.body;

      switch (action) {
        case 'scan_web':
          const prospects = await scanWebForProspects(data, tenantId);
          return res.status(200).json({ success: true, prospects });

        default:
          return res.status(400).json({ error: 'Invalid action. Only scan_web is supported.' });
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
async function scanWebForProspects(criteria, tenantId) {
  console.log('[Web Prospector] Finding people actively seeking strategic help...');

  let prospects = [];

  try {
    // Search for HIGH-VALUE buying signals in the last 30 days
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{
        role: 'user',
        content: `Find companies in the last 30 days with these HIGH-VALUE buying signals:

1. FUNDING ANNOUNCEMENTS:
   - Series A, B, C funding ($5M+)
   - Private equity investments
   - Acquisition announcements

2. EXECUTIVE HIRING:
   - New CEO, COO, President hired
   - VP of Operations, Chief Strategy Officer roles posted
   - Interim executive roles (signals need for strategic help)

3. EXPANSION SIGNALS:
   - Opening new offices/locations
   - Entering new markets
   - Launching new product lines

4. GROWTH CHALLENGES:
   - Companies publicly discussing scaling pains
   - IPO preparation announcements
   - Rapid headcount growth (50+ employees in quarter)

Search: TechCrunch, Business Insider, Inc Magazine, Forbes, LinkedIn company updates, Crunchbase, PitchBook.

For each company found, provide:
- Company name
- What happened (specific signal with date)
- CEO/Founder name
- Company size and industry
- Why this signals need for strategic consulting
- Source URL

Find 5 REAL companies with recent, verified signals. These should be $5M+ revenue companies.`
      }]
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    console.log('[Web Prospector] ===== PERPLEXITY SEARCH RESULTS =====');
    console.log(searchResults);
    console.log('[Web Prospector] ===== END SEARCH RESULTS =====');

    // CRITICAL: Only proceed if Perplexity found actual companies
    if (!searchResults || searchResults.length < 100 ||
        !searchResults.includes('http') ||
        searchResults.toLowerCase().includes('i cannot') ||
        searchResults.toLowerCase().includes('i don\'t have access')) {
      console.error('[Web Prospector] Perplexity did not return real web search results');
      console.error('[Web Prospector] Response was too short or contained no URLs');
      return [];
    }

    // Extract into structured format - BE STRICT ABOUT REAL DATA
    const extractionResponse = await callAIWithFallback(`From these REAL web search results, extract ONLY companies that were actually found in the search:

${searchResults}

CRITICAL RULES:
- ONLY extract companies explicitly mentioned in the search results above
- ONLY include companies with actual dates, funding amounts, or specific signals
- If a company name appears with "example" or hypothetical language, SKIP IT
- Each company MUST have a real source URL from the search results

For each REAL company with a verified buying signal, return JSON with EXACT field names:
{
  "companyName": "exact company name",
  "contactPerson": "CEO/Founder name",
  "recentSignal": "specific signal with date (e.g., 'Raised $15M Series B on Nov 20, 2024')",
  "whereFound": "source publication and URL",
  "intentScore": 85,
  "approachAngle": "how to position consulting based on their specific signal",
  "industry": "industry",
  "companySize": "employee count or revenue if mentioned",
  "postUrl": "source URL for verification"
}

CRITICAL: Only include companies that are $5M+ revenue, have verified signals from last 30 days, and represent real strategic consulting opportunities.

Return ONLY JSON array.`, 2000);

    // Parse prospects
    const jsonMatch = extractionResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const rawProspects = JSON.parse(jsonMatch[0]);

      // VALIDATE: Filter out fake/generated data
      prospects = rawProspects.filter(p => {
        const companyName = p.companyName || p.company || '';
        const signal = p.recentSignal || p.signal || '';
        const source = p.whereFound || p.postUrl || '';

        // Reject generic/fake company names
        const fakeNames = ['TechCorp', 'Solutions LLC', 'Innovations Inc', 'Tech Innovations',
                          'FinTech', 'HealthTech', 'EduSmart', 'GreenTech', 'Retail Revolution',
                          'Solutions Consulting', 'Innovators Inc'];

        if (fakeNames.some(fake => companyName.includes(fake))) {
          console.log(`[Web Prospector] ❌ Rejected FAKE company: ${companyName}`);
          return false;
        }

        // Require real URLs
        if (!source.startsWith('http')) {
          console.log(`[Web Prospector] ❌ Rejected - no URL: ${companyName}`);
          return false;
        }

        // Require specific dates in signals
        if (!signal.match(/202[4-5]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/)) {
          console.log(`[Web Prospector] ❌ Rejected - no date: ${companyName}`);
          return false;
        }

        console.log(`[Web Prospector] ✓ VALIDATED real prospect: ${companyName}`);
        return true;
      });

      console.log(`[Web Prospector] Found ${rawProspects.length} total, ${prospects.length} passed validation`);
    }

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

  // Save real help-seekers to database
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

    // Skip if we don't have company name or contact person
    if (companyName === 'Unknown Company' || !contactPerson) {
      console.log('[Web Prospector] Skipping - missing company or contact info');
      continue;
    }

    // Check if we already have this company
    const existingContact = await db.queryOne(
      'SELECT id FROM contacts WHERE company ILIKE $1 AND tenant_id = $2',
      [companyName, tenantId]
    );

    if (!existingContact) {
      const contact = await db.insert('contacts', {
        tenant_id: tenantId,
        full_name: contactPerson,
        company: companyName,
        stage: 'new',
        lead_source: `high_value_signal_${signalType.toLowerCase().replace(' ', '_')}`,
        notes: `💎 HIGH-VALUE PROSPECT ($5M+)\n\nSignal: ${recentSignal}\n\nIndustry: ${industry}\nSource: ${whereFound}\nVerify: ${postUrl}`,
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
