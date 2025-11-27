const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const db = require('./utils/db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

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
 * LINKEDIN PROSPECTING & HIGH-END SALES CHANNELS
 * Finds and qualifies high-value prospects from LinkedIn and premium networks
 */

// High-end prospect criteria
const IDEAL_CLIENT_PROFILE = {
  titles: [
    'CEO', 'Founder', 'Co-Founder', 'President',
    'Managing Director', 'General Manager',
    'VP of Operations', 'Chief Operating Officer',
    'Head of Strategy', 'Chief Strategy Officer'
  ],
  industries: [
    'Technology', 'SaaS', 'Professional Services',
    'Consulting', 'Financial Services', 'Healthcare',
    'Manufacturing', 'E-commerce', 'Real Estate'
  ],
  companySize: ['51-200', '201-500', '501-1000', '1000+'],
  minRevenue: 5000000, // $5M+
  signals: [
    'recently_funded',
    'expanding',
    'hiring',
    'new_in_role',
    'posted_about_growth'
  ]
};

// Premium sales channels
const SALES_CHANNELS = {
  linkedin: {
    name: 'LinkedIn Sales Navigator',
    type: 'professional_network',
    quality: 'premium',
    cost_per_lead: 50
  },
  apollo: {
    name: 'Apollo.io',
    type: 'b2b_database',
    quality: 'high',
    cost_per_lead: 25
  },
  zoominfo: {
    name: 'ZoomInfo',
    type: 'b2b_intelligence',
    quality: 'premium',
    cost_per_lead: 75
  },
  clearbit: {
    name: 'Clearbit',
    type: 'enrichment',
    quality: 'high',
    cost_per_lead: 30
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
      const stats = await getProspectingStats(tenantId);

      return res.status(200).json({
        success: true,
        idealClientProfile: IDEAL_CLIENT_PROFILE,
        salesChannels: SALES_CHANNELS,
        stats
      });
    }

    if (req.method === 'POST') {
      const { action, data } = req.body;

      switch (action) {
        case 'find_prospects':
          const prospects = await findHighEndProspects(data, tenantId);
          return res.status(200).json({ success: true, prospects });

        case 'qualify_prospect':
          const qualification = await qualifyProspect(data, tenantId);
          return res.status(200).json({ success: true, qualification });

        case 'generate_outreach':
          const outreach = await generatePersonalizedOutreach(data, tenantId);
          return res.status(200).json({ success: true, outreach });

        case 'track_engagement':
          await trackLinkedInEngagement(data, tenantId);
          return res.status(200).json({ success: true });

        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    }

  } catch (error) {
    console.error('[LinkedIn Prospector] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Find high-end prospects based on ideal client profile
 */
async function findHighEndProspects(criteria, tenantId) {
  console.log('[LinkedIn Prospector] Finding high-end prospects...');

  const searchCriteria = {
    ...IDEAL_CLIENT_PROFILE,
    ...criteria
  };

  // In production, this would call LinkedIn Sales Navigator API or Apollo.io
  // For now, we'll simulate finding prospects

  const prompt = `You are a B2B sales prospecting expert. Generate 5 high-quality prospect profiles that match this ideal client profile:

Titles: ${searchCriteria.titles.join(', ')}
Industries: ${searchCriteria.industries.join(', ')}
Company Size: ${searchCriteria.companySize.join(', ')}

For each prospect, provide:
1. Full Name
2. Job Title
3. Company Name
4. Industry
5. Company Size
6. Why they're a good fit (buying signals)
7. Personalized approach angle

Format as JSON array.`;

  const responseText = await callAIWithFallback(prompt, 2000);

  let prospects = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      prospects = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[LinkedIn Prospector] Error parsing prospects:', error);
  }

  // Save prospects to database
  for (const prospect of prospects) {
    const prospectName = prospect.name || prospect.fullName || prospect.Full_Name || 'Unknown';
    const prospectCompany = prospect.company || prospect.companyName || prospect.Company_Name || 'Unknown Company';

    // Skip if we don't have basic info
    if (prospectName === 'Unknown') continue;

    // Check for existing contact by company name instead of email (since we don't have emails)
    const existingContact = await db.queryOne(
      'SELECT id FROM contacts WHERE company ILIKE $1 AND tenant_id = $2',
      [prospectCompany, tenantId]
    );

    if (!existingContact) {
      await db.insert('contacts', {
        tenant_id: tenantId,
        full_name: prospectName,
        company: prospectCompany,
        stage: 'new',
        lead_source: 'linkedin_prospector',
        notes: `${prospect.title || prospect.jobTitle || prospect.Job_Title || 'Position unknown'} at ${prospectCompany}. ${prospect.why_good_fit || prospect.buyingSignals || prospect.Why_Good_Fit || 'High-value prospect'}`,
        client_type: 'prospect',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  return prospects;
}

/**
 * Qualify a prospect using AI
 */
async function qualifyProspect(prospectData, tenantId) {
  console.log('[LinkedIn Prospector] Qualifying prospect:', prospectData.name);

  const prompt = `Analyze this prospect for Maggie Forbes Strategies (strategic growth consulting for established businesses):

Name: ${prospectData.name}
Title: ${prospectData.title}
Company: ${prospectData.company}
Industry: ${prospectData.industry}
Company Size: ${prospectData.companySize}
Recent Activity: ${prospectData.recentActivity || 'None'}
LinkedIn Profile: ${prospectData.linkedinUrl || 'Not provided'}

Score this prospect 1-100 and provide:
1. Qualification Score (1-100)
2. Fit Reason (why they're a good/bad fit)
3. Recommended Approach (how to engage)
4. Urgency Level (low/medium/high)
5. Estimated Deal Size ($)

Format as JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  let qualification = {};
  try {
    const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      qualification = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[LinkedIn Prospector] Error parsing qualification:', error);
  }

  // Log qualification
  await db.insert('contact_activities', {
    tenant_id: tenantId,
    contact_id: prospectData.contactId,
    type: 'prospect_qualification',
    description: `Qualification Score: ${qualification.score}/100. ${qualification.fitReason}`,
    created_at: new Date()
  });

  return qualification;
}

/**
 * Generate personalized LinkedIn outreach message
 */
async function generatePersonalizedOutreach(prospectData, tenantId) {
  console.log('[LinkedIn Prospector] Generating outreach for:', prospectData.name);

  const prompt = `Write a personalized LinkedIn connection request or InMail for this prospect:

From: Maggie Forbes, Strategic Growth Consultant
Company: Maggie Forbes Strategies
Value Prop: We help established business owners scale strategically

Prospect: ${prospectData.name}
Title: ${prospectData.title}
Company: ${prospectData.company}
Industry: ${prospectData.industry}
Why reaching out: ${prospectData.reason || 'Strategic growth opportunity'}

Write a brief, professional message (under 300 characters for connection request OR under 1500 characters for InMail).
Include:
1. Specific reason for connecting (reference their company/role)
2. Clear value proposition
3. Soft call-to-action

Tone: Professional, consultative, not salesy.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const outreachMessage = response.content[0].text;

  // Save outreach template
  await db.insert('contact_activities', {
    tenant_id: tenantId,
    contact_id: prospectData.contactId,
    type: 'outreach_generated',
    description: `LinkedIn outreach: ${outreachMessage}`,
    created_at: new Date()
  });

  return {
    message: outreachMessage,
    channel: 'linkedin',
    type: prospectData.messageType || 'connection_request'
  };
}

/**
 * Track LinkedIn engagement
 */
async function trackLinkedInEngagement(engagementData, tenantId) {
  await db.insert('contact_activities', {
    tenant_id: tenantId,
    contact_id: engagementData.contactId,
    type: `linkedin_${engagementData.type}`,
    description: engagementData.description,
    created_at: new Date()
  });

  // Update contact stage based on engagement
  if (engagementData.type === 'accepted_connection') {
    await db.query(
      `UPDATE contacts SET stage = 'qualified', updated_at = $1 WHERE id = $2`,
      [new Date(), engagementData.contactId]
    );
  }
}

/**
 * Get prospecting statistics
 */
async function getProspectingStats(tenantId) {
  const stats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE lead_source = 'linkedin_prospector') as linkedin_prospects,
      COUNT(*) FILTER (WHERE lead_source = 'linkedin_prospector' AND stage = 'qualified') as qualified_prospects,
      COUNT(*) FILTER (WHERE lead_source = 'linkedin_prospector' AND stage = 'closed_won') as closed_won
    FROM contacts
    WHERE tenant_id = $1
  `, [tenantId]);

  return {
    totalProspects: parseInt(stats?.linkedin_prospects || 0),
    qualified: parseInt(stats?.qualified_prospects || 0),
    closedWon: parseInt(stats?.closed_won || 0),
    conversionRate: stats?.linkedin_prospects > 0
      ? ((stats.closed_won / stats.linkedin_prospects) * 100).toFixed(2)
      : 0
  };
}
