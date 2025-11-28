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

// AI provider fallback
async function callAIWithFallback(prompt, maxTokens = 2000) {
  const providers = [
    {
      name: 'Perplexity',
      call: async () => {
        const response = await perplexity.chat.completions.create({
          model: 'sonar',
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
    }
  }

  throw new Error('All AI providers failed');
}

module.exports = async (req, res) => {
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
      const stats = await getProspectingStats(tenantId);
      return res.status(200).json({
        success: true,
        stats
      });
    }

    if (req.method === 'POST') {
      const { action, data } = req.body;

      switch (action) {
        case 'find_prospects':
          const prospects = await findRealLinkedInProspects(data, tenantId);
          const debug = prospects._debug;
          delete prospects._debug;
          return res.status(200).json({ success: true, prospects, debug });

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

async function findRealLinkedInProspects(criteria, tenantId) {
  console.log('[LinkedIn Prospector] Searching with Sonar + Citations...');

  let prospects = [];
  let debugInfo = { response: null, citations: null, linkedInCitations: null, error: null };

  try {
    // Use Sonar with return_citations for REAL web search
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 LinkedIn posts from the last month where CEOs or Founders discuss scaling challenges, operational efficiency, or business growth. Provide author names, titles, companies, and what they discussed.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const responseText = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    debugInfo.response = responseText.substring(0, 300);
    debugInfo.citations = citations.length;

    console.log('[LinkedIn Prospector] Response:', responseText);
    console.log('[LinkedIn Prospector] Citations:', JSON.stringify(citations));

    if (!citations || citations.length === 0) {
      debugInfo.error = 'No citations returned';
      prospects._debug = debugInfo;
      return prospects;
    }

    const linkedInCitations = citations.filter(url =>
      url && url.includes('linkedin.com')
    );

    debugInfo.linkedInCitations = linkedInCitations.length;

    if (linkedInCitations.length === 0) {
      debugInfo.error = 'No LinkedIn URLs in citations';
      prospects._debug = debugInfo;
      return prospects;
    }

    // Extract structured data
    const extractionPrompt = `From this response, extract prospects as JSON array:

${responseText}

LinkedIn URLs: ${linkedInCitations.join(', ')}

Format:
[{
  "contactPerson": "Name",
  "title": "Title",
  "companyName": "Company",
  "challenge": "Challenge",
  "postUrl": "LinkedIn URL",
  "approachAngle": "How to help"
}]

Return ONLY the JSON array.`;

    const extractionResponse = await callAIWithFallback(extractionPrompt, 2000);

    const jsonMatch = extractionResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const rawProspects = JSON.parse(jsonMatch[0]);

      prospects = rawProspects.filter(p => {
        return p.contactPerson && p.contactPerson.length > 2 &&
               p.postUrl && p.postUrl.includes('linkedin.com');
      });

      console.log(`[LinkedIn Prospector] Found ${prospects.length} prospects`);
    }

    // Save to database
    for (const prospect of prospects) {
      const existingContact = await db.queryOne(
        'SELECT id FROM contacts WHERE full_name ILIKE $1 AND tenant_id = $2',
        [prospect.contactPerson, tenantId]
      );

      if (!existingContact) {
        const contact = await db.insert('contacts', {
          tenant_id: tenantId,
          full_name: prospect.contactPerson,
          company: prospect.companyName || null,
          stage: 'new',
          lead_source: 'linkedin_real_activity',
          notes: `💼 LinkedIn Activity\n\n${prospect.title || ''}\nChallenge: ${prospect.challenge}\n\nPost: ${prospect.postUrl}`,
          client_type: 'linkedin_warm_lead',
          created_at: new Date(),
          updated_at: new Date()
        });

        await db.insert('contact_activities', {
          tenant_id: tenantId,
          contact_id: contact.id,
          type: 'linkedin_activity_detected',
          description: `Post: ${prospect.postUrl}\n\nChallenge: ${prospect.challenge}\n\nApproach: ${prospect.approachAngle}`,
          created_at: new Date()
        });

        console.log(`[LinkedIn Prospector] ✓ Saved: ${prospect.contactPerson}`);
      }
    }

  } catch (error) {
    debugInfo.error = error.message;
    console.error('[LinkedIn Prospector] Error:', error.message);
  }

  prospects._debug = debugInfo;
  return prospects;
}

async function getProspectingStats(tenantId) {
  const stats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE lead_source = 'linkedin_real_activity') as linkedin_prospects,
      COUNT(*) FILTER (WHERE lead_source = 'linkedin_real_activity' AND stage = 'qualified') as qualified_prospects,
      COUNT(*) FILTER (WHERE lead_source = 'linkedin_real_activity' AND stage = 'closed_won') as closed_won
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
