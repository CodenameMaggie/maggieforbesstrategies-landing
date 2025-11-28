const OpenAI = require('openai');

/**
 * TEST ENDPOINT - Diagnose Perplexity API issues
 */

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

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

  const testResults = {
    apiKeyConfigured: !!process.env.PERPLEXITY_API_KEY,
    apiKeyPrefix: process.env.PERPLEXITY_API_KEY?.substring(0, 10) || 'NOT SET',
    tests: []
  };

  // Test different models (from official docs)
  const modelsToTest = [
    'sonar',
    'sonar-pro',
    'sonar-reasoning',
    'sonar-reasoning-pro',
    'sonar-deep-research'
  ];

  for (const modelName of modelsToTest) {
    try {
      console.log(`[Test] Trying model: ${modelName}`);

      const response = await perplexity.chat.completions.create({
        model: modelName,
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: 'What is the capital of France?'
        }],
        // All sonar models support search
        search_recency_filter: 'month'
      });

      testResults.tests.push({
        model: modelName,
        status: 'SUCCESS',
        response: response.choices[0].message.content.substring(0, 100),
        citations: response.citations?.length || 0
      });

      console.log(`[Test] ✓ ${modelName} succeeded`);

    } catch (error) {
      testResults.tests.push({
        model: modelName,
        status: 'FAILED',
        error: error.message,
        statusCode: error.status || error.statusCode
      });

      console.log(`[Test] ✗ ${modelName} failed: ${error.message}`);
    }
  }

  return res.status(200).json(testResults);
};
