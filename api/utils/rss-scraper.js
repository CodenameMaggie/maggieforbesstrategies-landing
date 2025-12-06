/**
 * Direct RSS Feed Scraper - NO AI NEEDED
 * Scrapes TechCrunch, Business Insider RSS feeds for funding news
 * Fast (1-3 seconds) vs Perplexity (20-30 seconds)
 * Free vs paid API
 */

/**
 * Scrape recent funding announcements from RSS feeds
 * Returns array of prospects with company, funding, etc.
 */
async function scrapeFundingNews() {
  console.log('[RSS Scraper] Fetching funding news from RSS feeds...');

  const prospects = [];

  // TechCrunch Funding RSS
  try {
    const tcProspects = await scrapeTechCrunchFunding();
    prospects.push(...tcProspects);
    console.log(`[RSS Scraper] Found ${tcProspects.length} from TechCrunch`);
  } catch (error) {
    console.error('[RSS Scraper] TechCrunch error:', error.message);
  }

  // Limit to 2 most recent to avoid timeout
  return prospects.slice(0, 2);
}

/**
 * Scrape TechCrunch funding announcements
 */
async function scrapeTechCrunchFunding() {
  const RSS_URL = 'https://techcrunch.com/tag/funding/feed/';

  try {
    const response = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MFS-Prospector/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();

    // Parse RSS XML
    const items = parseRSSItems(xml);
    const prospects = [];

    for (const item of items.slice(0, 5)) {  // Only process 5 most recent
      const prospect = extractProspectFromArticle(item);
      if (prospect) {
        prospects.push(prospect);
      }
    }

    return prospects;
  } catch (error) {
    console.error('[RSS Scraper] Error fetching TechCrunch:', error.message);
    return [];
  }
}

/**
 * Parse RSS XML into items
 */
function parseRSSItems(xml) {
  const items = [];

  // Extract all <item> blocks
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXML = match[1];

    // Extract fields from item
    const title = extractTag(itemXML, 'title');
    const link = extractTag(itemXML, 'link');
    const description = extractTag(itemXML, 'description');
    const pubDate = extractTag(itemXML, 'pubDate');

    if (title && link) {
      items.push({
        title: cleanText(title),
        link: cleanText(link),
        description: cleanText(description || ''),
        pubDate: new Date(pubDate || Date.now())
      });
    }
  }

  return items;
}

/**
 * Extract tag content from XML
 */
function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = xml.match(regex);

  if (cdataMatch) {
    return cdataMatch[1];
  }

  const simpleRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const simpleMatch = xml.match(simpleRegex);

  return simpleMatch ? simpleMatch[1] : null;
}

/**
 * Clean HTML entities and extra whitespace
 */
function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '')  // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract prospect data from article
 */
function extractProspectFromArticle(item) {
  const { title, description, link, pubDate } = item;
  const text = `${title} ${description}`;

  // Look for funding signals
  const fundingPatterns = [
    /raised \$?([\d.]+)\s*(million|billion|M|B)/i,
    /\$?([\d.]+)\s*(million|billion|M|B)\s+(?:series|round|funding)/i,
    /(series [a-z])/i,
    /funding round/i
  ];

  const hasFundingSignal = fundingPatterns.some(pattern => pattern.test(text));

  if (!hasFundingSignal) {
    return null;  // Not a funding announcement
  }

  // Extract company name (usually first proper noun or in title before "raises")
  let companyName = null;

  // Pattern 1: "Company raises $X"
  const raisesMatch = title.match(/^([^:]+?)\s+raises?\s+\$/i);
  if (raisesMatch) {
    companyName = raisesMatch[1].trim();
  }

  // Pattern 2: "Company gets $X"
  if (!companyName) {
    const getsMatch = title.match(/^([^:]+?)\s+gets?\s+\$/i);
    if (getsMatch) {
      companyName = getsMatch[1].trim();
    }
  }

  // Pattern 3: First part of title before comma/colon
  if (!companyName) {
    const beforePunctuation = title.split(/[,:]/)[0].trim();
    if (beforePunctuation.length < 50) {  // Reasonable company name length
      companyName = beforePunctuation;
    }
  }

  if (!companyName) {
    return null;  // Couldn't extract company name
  }

  // Extract funding amount
  const fundingMatch = text.match(/\$?([\d.]+)\s*(million|billion|M|B)/i);
  const fundingText = fundingMatch ? fundingMatch[0] : 'recent funding';

  // Extract series
  const seriesMatch = text.match(/series [a-z]/i);
  const series = seriesMatch ? seriesMatch[0] : '';

  // Build signal text
  const recentSignal = `Raised ${fundingText}${series ? ' ' + series : ''}`;

  // Determine industry from article
  let industry = 'Technology';
  if (text.toLowerCase().includes('fintech') || text.toLowerCase().includes('financial')) {
    industry = 'FinTech';
  } else if (text.toLowerCase().includes('health') || text.toLowerCase().includes('medical')) {
    industry = 'HealthTech';
  } else if (text.toLowerCase().includes('saas') || text.toLowerCase().includes('software')) {
    industry = 'SaaS';
  } else if (text.toLowerCase().includes('clean') || text.toLowerCase().includes('climate') || text.toLowerCase().includes('energy')) {
    industry = 'CleanTech';
  }

  return {
    companyName,
    contactPerson: `CEO - ${companyName}`,  // Will need enrichment
    recentSignal,
    whereFound: 'TechCrunch RSS',
    intentScore: 85,
    approachAngle: `Strategic consulting for ${recentSignal.toLowerCase()}`,
    industry,
    companySize: '$5M+',
    postUrl: link,
    signalType: 'Funding',
    signalDate: pubDate
  };
}

module.exports = {
  scrapeFundingNews
};
