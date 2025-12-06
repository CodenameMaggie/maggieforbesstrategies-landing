/**
 * Direct Perplexity API Test
 * Tests what Perplexity is actually returning
 */

require('dotenv').config({ path: '.env.local' });
const OpenAI = require('openai');

console.log('🔍 DIRECT PERPLEXITY API TEST');
console.log('====================================\n');

async function testPerplexityDirect() {
  const apiKey = process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.error('❌ PERPLEXITY_API_KEY not found in .env.local');
    return;
  }

  console.log('✅ API Key found');
  console.log('📡 Querying Perplexity for recent funding/hiring news...\n');

  try {
    const perplexity = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.perplexity.ai'
    });

    const response = await perplexity.chat.completions.create({
      model: 'sonar',
      messages: [{
        role: 'system',
        content: 'You are a business intelligence data extraction assistant. Extract ONLY factual company data from real news sources. Never use examples or placeholders. Always provide real company names, executive names, and verified funding amounts from actual news articles.'
      }, {
        role: 'user',
        content: `Search TechCrunch, Business Insider, and Crunchbase for companies that raised funding or hired executives in the last 30 days.

Find companies with these HIGH-VALUE signals:

1. FUNDING: Series A/B/C/D funding announcements ($5M+)
2. EXECUTIVE HIRING: New C-level executives (CEO, COO, VP Operations)
3. EXPANSION: Opening new offices, entering new markets
4. GROWTH: Major partnerships, acquisitions

Return 3-5 REAL companies in this table format:
| Company Name | CEO/Executive | What Happened | Industry |

Example of CORRECT format (with real data):
| Brevo | Armand Thiberge | Raised $583M Series D | Marketing Tech |

NO placeholders. NO examples. ONLY real companies from actual articles within the last 30 days.`
      }],
      return_citations: true
    });

    const searchResults = response.choices[0].message.content;
    const citations = response.citations || [];

    console.log('=== PERPLEXITY RESPONSE ===');
    console.log(searchResults);
    console.log('\n=== CITATIONS ===');
    console.log(`Found ${citations.length} citations:`);
    citations.forEach((cite, i) => {
      console.log(`${i + 1}. ${cite}`);
    });
    console.log('=== END ===\n');

    // Analyze response
    console.log('📊 ANALYSIS:');
    console.log(`Response length: ${searchResults.length} characters`);
    console.log(`Citations: ${citations.length}`);
    console.log(`Contains table format: ${searchResults.includes('|') ? 'Yes' : 'No'}`);
    console.log(`Contains company names: ${searchResults.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g) ? 'Yes' : 'No'}`);
    console.log(`Contains "CEO": ${searchResults.includes('CEO') ? 'Yes' : 'No'}`);
    console.log(`Contains "funding": ${searchResults.toLowerCase().includes('funding') ? 'Yes' : 'No'}`);
    console.log('');

    // Check for error patterns
    if (searchResults.toLowerCase().includes('i cannot') ||
        searchResults.toLowerCase().includes('i don\'t have access') ||
        searchResults.toLowerCase().includes('unable to')) {
      console.log('⚠️  WARNING: Perplexity returned an error message instead of search results');
      console.log('This might indicate API limitations or rate limiting\n');
    }

    return true;

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return false;
  }
}

testPerplexityDirect().then(() => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test complete - check response above                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
});
