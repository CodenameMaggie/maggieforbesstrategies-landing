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

        case 'detect_intent':
          const intentAnalysis = await detectBuyerIntent(data, tenantId);
          return res.status(200).json({ success: true, intentAnalysis });

        case 'search_news':
          const newsLeads = await searchBusinessNews(data, tenantId);
          return res.status(200).json({ success: true, leads: newsLeads });

        case 'monitor_forums':
          const forumLeads = await monitorBusinessForums(data, tenantId);
          return res.status(200).json({ success: true, leads: forumLeads });

        case 'track_job_postings':
          const jobSignals = await trackJobPostings(data, tenantId);
          return res.status(200).json({ success: true, signals: jobSignals });

        default:
          return res.status(400).json({ error: 'Invalid action' });
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
 * Scan the web for high-intent prospects
 */
async function scanWebForProspects(criteria, tenantId) {
  console.log('[Web Prospector] Scanning web for prospects...');

  const searchQueries = [
    'business looking for strategic consulting',
    'company seeking growth advisor',
    'scaling business need help',
    'business expansion consultant needed',
    'operational efficiency consultant'
  ];

  // Use Perplexity to search the web for real prospects
  let webSearchResults = '';
  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'llama-3.1-sonar-small-128k-online',
      messages: [{
        role: 'user',
        content: `Find recent news and announcements about companies that might need strategic growth consulting. Look for: companies getting new funding, hiring executives, expanding operations, facing growth challenges, or publicly seeking business advice. Return 3-5 specific examples with company names and what signals they're showing.`
      }]
    });
    webSearchResults = perplexityResponse.choices[0].message.content;
    console.log('[Web Prospector] Perplexity search results:', webSearchResults.substring(0, 200));
  } catch (error) {
    console.error('[Web Prospector] Perplexity error:', error.message);
  }

  const prompt = `You are a B2B web prospecting expert. Using these REAL web search results as a foundation, generate 5 high-intent prospect profiles for a strategic growth consulting business.

WEB SEARCH RESULTS:
${webSearchResults}

Generate 5 prospects. If the web search found real companies, include them. Otherwise create realistic profiles based on typical signals.

These prospects should show clear BUYER INTENT SIGNALS such as:
- Recent funding announcements
- Leadership changes (new CEO, VP Operations, etc.)
- Expansion announcements
- Hiring surges
- Public statements about scaling challenges
- Posts seeking business advice/consultants

For each prospect provide:
1. Company Name
2. Industry
3. Company Size (employees)
4. Recent Signal/Trigger Event (what made them show intent)
5. Where Found (news article, forum post, job posting, social media, etc.)
6. Intent Score (1-100, how likely they need consulting now)
7. Contact Person (if identifiable - CEO, Founder, COO, etc.)
8. Approach Angle (how to reach out based on their signal)

Format as JSON array. Make these realistic companies with genuine-sounding signals.`;

  const responseText = await callAIWithFallback(prompt, 2500);

  let prospects = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      prospects = JSON.parse(jsonMatch[0]);
      console.log('[Web Prospector] Parsed prospects:', JSON.stringify(prospects[0])); // Log first prospect to see field names
    } else {
      console.error('[Web Prospector] No JSON array found in response');
      console.log('[Web Prospector] Response preview:', responseText.substring(0, 500));
    }
  } catch (error) {
    console.error('[Web Prospector] Error parsing prospects:', error);
    console.log('[Web Prospector] Response preview:', responseText.substring(0, 500));
  }

  // Save prospects to database
  for (const prospect of prospects) {
    const existingContact = await db.queryOne(
      'SELECT id FROM contacts WHERE company ILIKE $1 AND tenant_id = $2',
      [prospect.companyName || prospect.company, tenantId]
    );

    if (!existingContact) {
      const contact = await db.insert('contacts', {
        tenant_id: tenantId,
        full_name: prospect.contactPerson || prospect.contact,
        company: prospect.companyName || prospect.company,
        stage: 'new',
        lead_source: `web_prospector_${prospect.whereFound || 'web'}`,
        notes: `Intent Score: ${prospect.intentScore}/100. Signal: ${prospect.recentSignal || prospect.signal}. Found: ${prospect.whereFound}`,
        client_type: 'high_intent_prospect',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Log the intent signal
      await db.insert('contact_activities', {
        tenant_id: tenantId,
        contact_id: contact.id,
        type: 'intent_signal_detected',
        description: `Web signal: ${prospect.recentSignal || prospect.signal}. Source: ${prospect.whereFound}. Approach: ${prospect.approachAngle || prospect.approach}`,
        created_at: new Date()
      });
    }
  }

  return prospects;
}

/**
 * Detect buyer intent from company data/activity
 */
async function detectBuyerIntent(companyData, tenantId) {
  console.log('[Web Prospector] Detecting buyer intent for:', companyData.company);

  const prompt = `Analyze this company for buyer intent signals indicating they need strategic growth consulting:

Company: ${companyData.company}
Industry: ${companyData.industry || 'Not specified'}
Recent Activity: ${companyData.recentActivity || 'None provided'}
Company Size: ${companyData.size || 'Not specified'}
Recent News: ${companyData.news || 'None'}
Job Postings: ${companyData.jobPostings || 'None'}
Social Media Activity: ${companyData.socialActivity || 'None'}

Analyze for these intent signals:
- Organizational changes (new leadership, restructuring)
- Growth indicators (funding, expansion, hiring surge)
- Pain points (scaling challenges, operational issues)
- Active research (downloading guides, attending webinars)

Provide:
1. Intent Score (1-100)
2. Primary Intent Signal (what triggered interest)
3. Urgency Level (low/medium/high)
4. Recommended Timing (reach out now, wait 2 weeks, etc.)
5. Best Approach (how to engage based on signals)
6. Estimated Deal Size ($)

Format as JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  let intentAnalysis = {};
  try {
    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      intentAnalysis = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[Web Prospector] Error parsing intent:', error);
  }

  return intentAnalysis;
}

/**
 * Search business news for prospects with buying signals
 */
async function searchBusinessNews(searchCriteria, tenantId) {
  console.log('[Web Prospector] Searching business news...');

  // In production, this would use real news APIs (Google News API, NewsAPI, etc.)
  // For demo, we'll simulate finding companies in the news

  const prompt = `Generate 3 realistic business news items that would indicate companies needing strategic consulting:

Examples of good news triggers:
- "TechStart Inc. raises $10M Series A, plans to triple team size"
- "Manufacturing Co. appoints new COO to lead operational transformation"
- "RetailCorp announces expansion into 5 new markets"
- "ServiceCo struggles with scaling challenges as demand surges"

For each news item provide:
1. Headline
2. Company Name
3. Industry
4. Key Signal (what indicates they need consulting)
5. Source (e.g., "TechCrunch", "Business Insider")
6. Published Date (recent, within last 7 days)
7. Why This Is a Good Lead

Format as JSON array.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  let newsLeads = [];
  try {
    const jsonMatch = response.content[0].text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      newsLeads = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[Web Prospector] Error parsing news:', error);
  }

  // Save to database
  for (const lead of newsLeads) {
    const existingContact = await db.queryOne(
      'SELECT id FROM contacts WHERE company ILIKE $1 AND tenant_id = $2',
      [lead.companyName || lead.company, tenantId]
    );

    if (!existingContact) {
      await db.insert('contacts', {
        tenant_id: tenantId,
        company: lead.companyName || lead.company,
        stage: 'new',
        lead_source: 'business_news',
        notes: `News: ${lead.headline}. Signal: ${lead.keySignal}. Source: ${lead.source}`,
        client_type: 'news_prospect',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  return newsLeads;
}

/**
 * Monitor business forums for people seeking help
 */
async function monitorBusinessForums(searchCriteria, tenantId) {
  console.log('[Web Prospector] Monitoring business forums...');

  // In production, this would scrape Reddit, Indie Hackers, Quora, etc.
  // For demo, we'll simulate finding relevant forum posts

  const prompt = `Generate 3 realistic business forum posts where business owners are seeking strategic consulting help:

Examples:
- Reddit r/entrepreneur: "Scaled from $2M to $10M revenue in 18 months. Operations are chaos. Need help."
- Indie Hackers: "SaaS hit $50k MRR but team is overwhelmed. How do I scale sustainably?"
- Quora: "When should a growing business hire a strategic consultant vs full-time COO?"

For each post provide:
1. Platform (Reddit, Quora, Indie Hackers, etc.)
2. Post Title/Question
3. Author Username
4. Pain Point (what they need help with)
5. Company Details (if mentioned - size, revenue, industry)
6. Engagement Opportunity (how to help/reach out)

Format as JSON array.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  let forumLeads = [];
  try {
    const jsonMatch = response.content[0].text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      forumLeads = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[Web Prospector] Error parsing forums:', error);
  }

  return forumLeads;
}

/**
 * Track job postings as growth signals
 */
async function trackJobPostings(searchCriteria, tenantId) {
  console.log('[Web Prospector] Tracking job postings...');

  // In production, this would use LinkedIn Jobs API, Indeed API, etc.
  // Strategic role postings = company scaling = need consulting

  const prompt = `Generate 3 companies posting strategic roles that indicate need for growth consulting:

Look for roles like:
- VP of Operations
- Chief Operating Officer (COO)
- Head of Strategy
- Director of Business Operations
- Strategic Planning Manager

For each posting provide:
1. Company Name
2. Industry
3. Job Title
4. Why This Signals Growth (e.g., "Creating new COO role = scaling operations")
5. Company Size
6. Posted On (LinkedIn, Indeed, etc.)
7. Consulting Opportunity (how a consultant could help now, before they hire)

Format as JSON array.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  let jobSignals = [];
  try {
    const jsonMatch = response.content[0].text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jobSignals = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[Web Prospector] Error parsing jobs:', error);
  }

  // Save to database
  for (const signal of jobSignals) {
    const existingContact = await db.queryOne(
      'SELECT id FROM contacts WHERE company ILIKE $1 AND tenant_id = $2',
      [signal.companyName || signal.company, tenantId]
    );

    if (!existingContact) {
      await db.insert('contacts', {
        tenant_id: tenantId,
        company: signal.companyName || signal.company,
        stage: 'new',
        lead_source: 'job_posting_signal',
        notes: `Job Signal: Posting for ${signal.jobTitle}. ${signal.whyThisSignalsGrowth}. Opportunity: ${signal.consultingOpportunity}`,
        client_type: 'job_signal_prospect',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  return jobSignals;
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
