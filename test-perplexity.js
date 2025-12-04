require('dotenv').config({ path: '.env.local' });
const OpenAI = require('openai');

async function testPerplexity() {
  console.log('\n=== TESTING PERPLEXITY API ===\n');

  const apiKey = process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    console.error('❌ PERPLEXITY_API_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('✓ API Key found:', apiKey.substring(0, 10) + '...');

  const perplexity = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.perplexity.ai'
  });

  try {
    console.log('\n📡 Making test API call to Perplexity...\n');

    const response = await perplexity.chat.completions.create({
      model: 'sonar',  // Changed from sonar-pro
      messages: [{
        role: 'system',
        content: 'You are a data extraction assistant. Extract ONLY factual data from sources. Never refuse or explain. Just extract and format.'
      }, {
        role: 'user',
        content: 'Search TechCrunch for companies that raised funding recently. Return a table with: Company | Amount | Date'
      }],
      return_citations: true
    });

    const result = response.choices[0].message.content;
    const citations = response.citations || [];

    console.log('✅ API CALL SUCCESSFUL!\n');
    console.log('=== RESPONSE ===');
    console.log(result);
    console.log('\n=== CITATIONS ===');
    console.log('Count:', citations.length);
    citations.forEach((cite, i) => {
      console.log(`${i + 1}. ${cite}`);
    });
    console.log('\n=== ANALYSIS ===');
    console.log('Response length:', result.length);
    console.log('Has company indicators:', result.includes('CEO') || result.includes('funding'));
    console.log('Appears to be real data:', !result.includes('I cannot') && !result.includes('I don\'t have access'));

  } catch (error) {
    console.error('\n❌ API CALL FAILED!');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
  }

  console.log('\n=== TEST COMPLETE ===\n');
}

testPerplexity();
