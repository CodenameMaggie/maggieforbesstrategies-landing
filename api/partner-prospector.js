const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const db = require('./utils/db');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPEN_API_KEY,
});

// Perplexity for web search
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

/**
 * STRATEGIC PARTNER PROSPECTOR
 * Find high-value referral partners: PE firms, conference organizers, complementary consultants
 * These partners can send you enterprise clients - much more valuable than direct prospecting
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
    if (req.method === 'POST') {
      const { partner_type } = req.body;

      let partners = [];

      switch (partner_type) {
        case 'pe_firms':
          partners = await findPEFirms(tenantId, req);
          break;

        case 'conference_speakers':
          partners = await findConferenceSpeakers(tenantId, req);
          break;

        case 'complementary_consultants':
          partners = await findComplementaryConsultants(tenantId, req);
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid partner_type. Must be: pe_firms, conference_speakers, or complementary_consultants'
          });
      }

      return res.status(200).json({
        success: true,
        partners,
        count: partners.length
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('[Partner Prospector] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Find Private Equity firms (best referral partners for consulting)
 * PE firms need consultants for their portfolio companies
 */
async function findPEFirms(tenantId, req) {
  console.log('[Partner Prospector] Finding PE firms with active deal flow...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 active Private Equity firms with recent portfolio company investments in the last 60 days.

Focus on:
- Mid-market PE firms ($100M - $2B AUM)
- Firms that invest in growth-stage companies needing operational consulting
- Recent acquisitions or portfolio company add-ons

For each firm provide:
- Firm name
- Managing Partner or Investment Partner name
- Recent portfolio company acquisition (last 60 days)
- Firm size/focus area
- Why they need strategic consultants for portfolio companies

Sources: PitchBook, PE Hub, Private Equity International, Crunchbase.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[Partner Prospector] PE Firms search results length:', searchResults.length);

    const partners = extractPartnersFromTable(searchResults, 'pe_firm', citations);

    // Save to database
    for (const partner of partners) {
      await saveStrategicPartner(tenantId, partner, req);
    }

    return partners;

  } catch (error) {
    console.error('[Partner Prospector] PE Firms search error:', error.message);
    return [];
  }
}

/**
 * Find conference organizers & speakers (great for visibility and partnerships)
 */
async function findConferenceSpeakers(tenantId, req) {
  console.log('[Partner Prospector] Finding business conferences and speaking opportunities...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 upcoming business strategy and growth conferences in Q1 2026 (January-March).

Focus on:
- C-suite audience (CEOs, COOs, CFOs)
- Growth/scaling topics
- Conferences that accept speaker proposals
- 500+ attendees

For each conference provide:
- Conference name
- Organizer/contact person
- Date and location
- Expected audience size and type
- Speaking opportunity details (if available)

Sources: Conference listings, business event calendars, industry associations.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[Partner Prospector] Conference search results length:', searchResults.length);

    const partners = extractPartnersFromTable(searchResults, 'conference_organizer', citations);

    // Save to database
    for (const partner of partners) {
      await saveStrategicPartner(tenantId, partner, req);
    }

    return partners;

  } catch (error) {
    console.error('[Partner Prospector] Conference search error:', error.message);
    return [];
  }
}

/**
 * Find complementary consultants (for referral partnerships)
 */
async function findComplementaryConsultants(tenantId, req) {
  console.log('[Partner Prospector] Finding complementary consulting firms...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 boutique consulting firms that specialize in areas complementary to strategic operations consulting.

Focus on firms specializing in:
- IT/Technology consulting
- Financial advisory (CFO services)
- HR/Talent consulting
- Marketing/Growth consulting
- Legal/Compliance consulting

For each firm:
- Firm name
- Founder/Managing Partner
- Specialization area
- Client profile (what size companies they serve)
- Why good referral partner fit

Look for firms serving mid-market companies ($10M-$500M revenue).

Sources: Consulting industry directories, LinkedIn, firm websites.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[Partner Prospector] Complementary consultants search results length:', searchResults.length);

    const partners = extractPartnersFromTable(searchResults, 'complementary_consultant', citations);

    // Save to database
    for (const partner of partners) {
      await saveStrategicPartner(tenantId, partner, req);
    }

    return partners;

  } catch (error) {
    console.error('[Partner Prospector] Complementary consultants search error:', error.message);
    return [];
  }
}

/**
 * Extract partners from Perplexity markdown table format
 */
function extractPartnersFromTable(searchResults, partnerType, citations) {
  const partners = [];

  // Try parsing markdown table format
  const tableMatch = searchResults.match(/\|[\s\S]+?\n\|[-|\s]+\|\n([\s\S]+?)(?:\n\n|$)/i);

  if (tableMatch) {
    const tableRows = tableMatch[1].trim().split('\n');

    for (const row of tableRows) {
      const cells = row.split('|').map(c => c.trim()).filter(c => c);

      if (cells.length >= 2) {
        const companyName = cells[0].replace(/\*\*/g, '').trim();
        const contactPerson = cells[1].trim();
        const details = cells.length >= 3 ? cells[2].trim() : '';
        const focusArea = cells.length >= 4 ? cells[3].trim() : '';

        // Skip header rows
        if (!companyName || companyName.toLowerCase().includes('firm') && companyName.toLowerCase().includes('name')) continue;

        // Skip if contact not disclosed
        if (contactPerson.toLowerCase().includes('not disclosed') ||
            contactPerson.toLowerCase().includes('not public') ||
            contactPerson.toLowerCase().includes('not specified')) {
          console.log(`[Partner Prospector] ⚠ Skipping ${companyName} - contact not public`);
          continue;
        }

        partners.push({
          partner_type: partnerType,
          company_name: companyName,
          contact_name: contactPerson,
          focus_area: focusArea || details,
          why_good_fit: details,
          source_url: citations[0] || 'https://www.perplexity.ai',
          tier: 'prospect',
          partnership_status: 'prospecting'
        });
      }
    }

    console.log(`[Partner Prospector] Extracted ${partners.length} ${partnerType} partners from table`);
  } else {
    console.log('[Partner Prospector] No table found in results, trying text extraction...');

    // Fallback: Extract from numbered list format
    const listPattern = /\d+\.\s+\*\*([^\*]+)\*\*[\s\S]+?(?:\*\*(?:Managing Partner|Contact|Organizer):\*\*\s+([^\n]+))?/gi;
    let match;

    while ((match = listPattern.exec(searchResults)) !== null) {
      const companyName = match[1].trim();
      const contactPerson = match[2] ? match[2].trim() : 'Not specified';

      if (contactPerson.toLowerCase().includes('not specified')) continue;

      partners.push({
        partner_type: partnerType,
        company_name: companyName,
        contact_name: contactPerson,
        focus_area: '',
        why_good_fit: '',
        source_url: citations[0] || 'https://www.perplexity.ai',
        tier: 'prospect',
        partnership_status: 'prospecting'
      });
    }

    console.log(`[Partner Prospector] Extracted ${partners.length} partners from list format`);
  }

  return partners;
}

/**
 * Save strategic partner to database
 */
async function saveStrategicPartner(tenantId, partnerData, req) {
  const isManualCall = req.headers.origin && req.headers.origin.includes('maggieforbesstrategies.com');

  if (isManualCall) {
    // Manual dashboard calls - don't save, just return data
    console.log(`[Partner Prospector] Manual call - returning partner without saving: ${partnerData.company_name}`);
    return;
  }

  // Check if partner already exists
  const existing = await db.queryOne(
    'SELECT id FROM strategic_partners WHERE company_name ILIKE $1 AND tenant_id = $2',
    [partnerData.company_name, tenantId]
  );

  if (!existing) {
    await db.insert('strategic_partners', {
      tenant_id: tenantId,
      partner_type: partnerData.partner_type,
      company_name: partnerData.company_name,
      contact_name: partnerData.contact_name,
      focus_area: partnerData.focus_area,
      why_good_fit: partnerData.why_good_fit,
      tier: 'prospect',
      partnership_status: 'prospecting',
      created_at: new Date(),
      updated_at: new Date()
    });

    console.log(`[Partner Prospector] ✓ Saved strategic partner: ${partnerData.company_name}`);
  } else {
    console.log(`[Partner Prospector] Skipping duplicate: ${partnerData.company_name}`);
  }
}
