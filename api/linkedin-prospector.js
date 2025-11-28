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
      // Continue to next provider
    }
  }

  throw new Error('All AI providers failed');
}

/**
 * LINKEDIN PROSPECTING - REAL DATA ONLY
 * Uses Perplexity to search for LinkedIn posts where people discuss growth challenges
 */

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

/**
 * Find REAL LinkedIn prospects using Perplexity web search
 * Searches for actual LinkedIn posts/articles about growth challenges
 */
async function findRealLinkedInProspects(criteria, tenantId) {
  console.log('[LinkedIn Prospector] Searching for REAL LinkedIn activity...');

  let prospects = [];
  let debugInfo = { perplexityResponse: null, validationFailed: null, error: null };

  try {
    // Use Perplexity SEARCH API (not chat) for real web search
    const searchQuery = `site:linkedin.com/posts OR site:linkedin.com/pulse CEOs Founders executives discuss scaling challenges operational efficiency strategic planning growth bottlenecks last 30 days`;

    const perplexityResponse = await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: searchQuery,
        search_recency_filter: 'month'
      })
    });

    if (!perplexityResponse.ok) {
      throw new Error(`Perplexity Search API error: ${perplexityResponse.status} ${perplexityResponse.statusText}`);
    }

    const searchData = await perplexityResponse.json();

    // Search API returns: { results: [{url, title, snippet, ...}], ... }
    const searchResults = searchData.results || [];
    debugInfo.perplexityResponse = JSON.stringify(searchData).substring(0, 500);

    console.log('[LinkedIn Prospector] ===== PERPLEXITY SEARCH RESULTS =====');
    console.log(JSON.stringify(searchData, null, 2));
    console.log('[LinkedIn Prospector] ===== END SEARCH RESULTS =====');

    // Validate we got real search results
    if (!searchResults || searchResults.length === 0) {
      debugInfo.validationFailed = 'Perplexity Search returned no results';
      console.error('[LinkedIn Prospector] Perplexity Search returned no results');
      prospects._debug = debugInfo;
      return prospects;
    }

    // Filter for LinkedIn URLs only
    const linkedInResults = searchResults.filter(r =>
      r.url && r.url.includes('linkedin.com')
    );

    if (linkedInResults.length === 0) {
      debugInfo.validationFailed = 'No LinkedIn URLs in search results';
      console.error('[LinkedIn Prospector] No LinkedIn URLs in search results');
      prospects._debug = debugInfo;
      return prospects;
    }

    // Extract structured data using AI
    const resultsText = linkedInResults.map(r =>
      `URL: ${r.url}\nTitle: ${r.title || 'N/A'}\nSnippet: ${r.snippet || 'N/A'}\n`
    ).join('\n---\n');

    const extractionResponse = await callAIWithFallback(`From these REAL LinkedIn search results, extract prospect information:

${resultsText}

For each result, try to extract:
{
  "contactPerson": "Author's name if mentioned",
  "title": "Author's title/role if mentioned",
  "companyName": "Company name if mentioned",
  "challenge": "What challenge/topic is discussed",
  "postUrl": "The LinkedIn URL",
  "postDate": "Date if mentioned",
  "approachAngle": "How to help based on the topic"
}

Return ONLY a JSON array. If author name is not clear, use "LinkedIn Professional" as contactPerson.`, 2000);

    // Parse and validate
    const jsonMatch = extractionResponse.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const rawProspects = JSON.parse(jsonMatch[0]);

      // Validation - URLs are already real from Perplexity Search API
      prospects = rawProspects.filter(p => {
        const name = p.contactPerson || '';
        const url = p.postUrl || '';

        // Must have LinkedIn URL
        if (!url.includes('linkedin.com')) {
          console.log(`[LinkedIn Prospector] ❌ Rejected - no LinkedIn URL`);
          return false;
        }

        // Must have contact person
        if (!name || name.length < 3) {
          console.log(`[LinkedIn Prospector] ❌ Rejected - no contact person`);
          return false;
        }

        console.log(`[LinkedIn Prospector] ✓ VALIDATED: ${name}`);
        return true;
      });

      console.log(`[LinkedIn Prospector] Found ${rawProspects.length} total, ${prospects.length} passed validation`);
    }

  } catch (error) {
    debugInfo.error = error.message;
    console.error('[LinkedIn Prospector] Search error:', error.message);
    prospects._debug = debugInfo;
    return prospects;
  }

  // Save validated prospects to database
  for (const prospect of prospects) {
    const contactPerson = prospect.contactPerson || prospect.name || null;
    const companyName = prospect.companyName || prospect.company || 'Not specified';
    const title = prospect.title || prospect.jobTitle || 'Not specified';
    const challenge = prospect.challenge || prospect.recentSignal || 'LinkedIn activity';
    const postUrl = prospect.postUrl || prospect.url || '';
    const approachAngle = prospect.approachAngle || prospect.approach || '';

    if (!contactPerson) {
      console.log('[LinkedIn Prospector] Skipping - no contact person');
      continue;
    }

    // Check for existing
    const existingContact = await db.queryOne(
      'SELECT id FROM contacts WHERE full_name ILIKE $1 AND tenant_id = $2',
      [contactPerson, tenantId]
    );

    if (!existingContact) {
      const contact = await db.insert('contacts', {
        tenant_id: tenantId,
        full_name: contactPerson,
        company: companyName !== 'Not specified' ? companyName : null,
        stage: 'new',
        lead_source: 'linkedin_real_activity',
        notes: `💼 REAL LinkedIn Activity\n\n${title}\nChallenge: ${challenge}\n\nLinkedIn Post: ${postUrl}`,
        client_type: 'linkedin_warm_lead',
        created_at: new Date(),
        updated_at: new Date()
      });

      // Log activity
      await db.insert('contact_activities', {
        tenant_id: tenantId,
        contact_id: contact.id,
        type: 'linkedin_activity_detected',
        description: `LinkedIn Post: ${postUrl}\n\nChallenge Discussed: ${challenge}\n\nApproach: ${approachAngle}`,
        created_at: new Date()
      });

      console.log(`[LinkedIn Prospector] ✓ Saved: ${contactPerson} (${companyName})`);
    } else {
      console.log(`[LinkedIn Prospector] Skipping duplicate: ${contactPerson}`);
    }
  }

  return prospects;
}

/**
 * Get prospecting statistics
 */
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
