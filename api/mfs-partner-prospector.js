const OpenAI = require('openai');
const db = require('./utils/db');

// Perplexity for web search
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

/**
 * MFS STRATEGIC PARTNER PROSPECTOR
 * Find referral partners for Strategic Growth Architecture services
 *
 * Target Partner Types:
 * 1. Technology Agencies - Web/app dev agencies serving $5M-$100M companies
 * 2. CRM/MarTech Vendors - Companies selling to your ideal clients
 * 3. Business Brokers/M&A Advisors - Firms helping companies prepare for sale
 * 4. Fractional Executive Networks - Fractional CMOs, COOs, CFOs
 * 5. Industry Associations - Groups serving mid-market B2B companies
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
        case 'technology_agencies':
          partners = await findTechnologyAgencies(tenantId, req);
          break;

        case 'crm_martech_vendors':
          partners = await findCRMMarTechVendors(tenantId, req);
          break;

        case 'business_brokers':
          partners = await findBusinessBrokers(tenantId, req);
          break;

        case 'fractional_executives':
          partners = await findFractionalExecutives(tenantId, req);
          break;

        case 'industry_associations':
          partners = await findIndustryAssociations(tenantId, req);
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid partner_type. Must be: technology_agencies, crm_martech_vendors, business_brokers, fractional_executives, or industry_associations'
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
    console.error('[MFS Partner Prospector] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Find technology agencies serving mid-market companies
 * These agencies build websites/apps but don't offer growth architecture
 */
async function findTechnologyAgencies(tenantId, req) {
  console.log('[MFS Partner Prospector] Finding technology agencies...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 reputable web design and development agencies that serve mid-market B2B companies ($5M-$100M revenue).

Focus on agencies that:
- Specialize in enterprise web development or custom software
- Serve B2B clients, not small businesses
- Have case studies with recognizable mid-market brands
- Located in major US tech hubs

For each agency:
- Agency name
- Founder/CEO name
- Location
- Typical client profile
- Why good referral partner (they build sites, we handle growth systems)

Sources: Clutch.co, GoodFirms, Agency directories, LinkedIn.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[MFS Partner Prospector] Technology agencies search results length:', searchResults.length);

    const partners = extractPartnersFromResponse(searchResults, 'technology_agency', citations);
    await savePartnersToDatabase(tenantId, partners, req);

    return partners;

  } catch (error) {
    console.error('[MFS Partner Prospector] Technology agencies search error:', error.message);
    return [];
  }
}

/**
 * Find CRM and MarTech vendors
 * They sell to your ideal clients and need implementation partners
 */
async function findCRMMarTechVendors(tenantId, req) {
  console.log('[MFS Partner Prospector] Finding CRM/MarTech vendors...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 CRM, marketing automation, or sales enablement software companies that serve mid-market B2B organizations.

Focus on vendors that:
- Sell to companies with $5M-$100M revenue
- Have implementation/services partner programs
- Need strategic consultants to help customers get value

For each vendor:
- Company name
- VP of Partnerships or Partner Program lead name
- Product category (CRM, marketing automation, sales enablement, etc.)
- Ideal customer profile
- Partner program details if available

Sources: G2, Capterra, SaaS vendor directories, LinkedIn.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[MFS Partner Prospector] CRM/MarTech vendors search results length:', searchResults.length);

    const partners = extractPartnersFromResponse(searchResults, 'crm_martech_vendor', citations);
    await savePartnersToDatabase(tenantId, partners, req);

    return partners;

  } catch (error) {
    console.error('[MFS Partner Prospector] CRM/MarTech vendors search error:', error.message);
    return [];
  }
}

/**
 * Find business brokers and M&A advisors
 * Companies preparing for sale need growth systems first
 */
async function findBusinessBrokers(tenantId, req) {
  console.log('[MFS Partner Prospector] Finding business brokers...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 business brokerage firms or M&A advisory firms that help mid-market companies ($10M-$100M) sell their businesses.

Focus on firms that:
- Specialize in mid-market M&A transactions
- Advise companies on increasing enterprise value before sale
- Work with B2B companies

For each firm:
- Firm name
- Managing Partner or Principal name
- Location
- Typical deal size
- Why strategic partner (companies need growth systems before sale)

Sources: M&A directories, IBBA (International Business Brokers Association), LinkedIn.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[MFS Partner Prospector] Business brokers search results length:', searchResults.length);

    const partners = extractPartnersFromResponse(searchResults, 'business_broker', citations);
    await savePartnersToDatabase(tenantId, partners, req);

    return partners;

  } catch (error) {
    console.error('[MFS Partner Prospector] Business brokers search error:', error.message);
    return [];
  }
}

/**
 * Find fractional executive networks
 * Fractional CMOs, COOs, CFOs encounter companies needing growth architecture
 */
async function findFractionalExecutives(tenantId, req) {
  console.log('[MFS Partner Prospector] Finding fractional executive networks...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 fractional executive firms or networks (fractional CMO, COO, CFO services) serving mid-market companies.

Focus on firms that:
- Provide fractional C-suite executives to $5M-$100M companies
- Have multiple fractional executives on their roster
- Serve B2B companies

For each firm:
- Firm name
- Founder or Managing Partner name
- Services (fractional CMO, COO, CFO, etc.)
- Target client size
- Why good referral partner

Sources: Fractional executive directories, LinkedIn, business consulting listings.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[MFS Partner Prospector] Fractional executives search results length:', searchResults.length);

    const partners = extractPartnersFromResponse(searchResults, 'fractional_executive_network', citations);
    await savePartnersToDatabase(tenantId, partners, req);

    return partners;

  } catch (error) {
    console.error('[MFS Partner Prospector] Fractional executives search error:', error.message);
    return [];
  }
}

/**
 * Find industry associations
 * Trade groups serving mid-market B2B companies
 */
async function findIndustryAssociations(tenantId, req) {
  console.log('[MFS Partner Prospector] Finding industry associations...');

  try {
    const perplexityResponse = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'user',
        content: `Find 5 B2B industry associations or trade groups that serve mid-market companies ($5M-$100M revenue).

Focus on associations that:
- Have corporate member companies (not individual memberships)
- Host conferences or networking events
- Serve B2B industries (manufacturing, professional services, technology, etc.)
- Have partnership or sponsorship opportunities

For each association:
- Association name
- Executive Director or CEO name
- Industry focus
- Member company profile
- Partnership opportunities

Sources: Association directories, industry trade group listings.`
      }],
      return_citations: true,
      search_recency_filter: 'month'
    });

    const searchResults = perplexityResponse.choices[0].message.content;
    const citations = perplexityResponse.citations || [];

    console.log('[MFS Partner Prospector] Industry associations search results length:', searchResults.length);

    const partners = extractPartnersFromResponse(searchResults, 'industry_association', citations);
    await savePartnersToDatabase(tenantId, partners, req);

    return partners;

  } catch (error) {
    console.error('[MFS Partner Prospector] Industry associations search error:', error.message);
    return [];
  }
}

/**
 * Extract partners from Perplexity response (handles various formats)
 */
function extractPartnersFromResponse(searchResults, partnerType, citations) {
  const partners = [];

  // Try table format first
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

        if (!companyName || companyName.toLowerCase().includes('firm') && companyName.toLowerCase().includes('name')) continue;

        if (contactPerson.toLowerCase().includes('not disclosed') ||
            contactPerson.toLowerCase().includes('not public') ||
            contactPerson.toLowerCase().includes('not specified')) {
          console.log(`[MFS Partner Prospector] ⚠ Skipping ${companyName} - contact not public`);
          continue;
        }

        partners.push({
          partner_type: partnerType,
          company_name: companyName,
          contact_name: contactPerson,
          focus_area: focusArea || details,
          why_good_fit: details,
          source_url: citations[0] || 'https://www.perplexity.ai'
        });
      }
    }
  } else {
    // Fallback: numbered list format
    const listPattern = /\d+\.\s+\*\*([^\*]+)\*\*[\s\S]+?(?:\*\*(?:CEO|Founder|Partner|Director):\*\*\s+([^\n]+))?/gi;
    let match;

    while ((match = listPattern.exec(searchResults)) !== null) {
      const companyName = match[1].trim();
      const contactPerson = match[2] ? match[2].trim() : 'Research needed';

      partners.push({
        partner_type: partnerType,
        company_name: companyName,
        contact_name: contactPerson,
        focus_area: '',
        why_good_fit: '',
        source_url: citations[0] || 'https://www.perplexity.ai'
      });
    }
  }

  console.log(`[MFS Partner Prospector] Extracted ${partners.length} ${partnerType} partners`);
  return partners;
}

/**
 * Save partners to database
 */
async function savePartnersToDatabase(tenantId, partners, req) {
  const isManualCall = req.headers.origin && req.headers.origin.includes('maggieforbesstrategies.com');

  if (isManualCall && partners.length > 0) {
    console.log(`[MFS Partner Prospector] Manual call - returning ${partners.length} partners without saving`);
    return;
  }

  for (const partnerData of partners) {
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

      console.log(`[MFS Partner Prospector] ✓ Saved: ${partnerData.company_name}`);
    } else {
      console.log(`[MFS Partner Prospector] Skipping duplicate: ${partnerData.company_name}`);
    }
  }
}
