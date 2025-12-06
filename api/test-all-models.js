/**
 * Test All Perplexity Models
 * Finds the fastest model that works within Vercel timeout
 */

const OpenAI = require('openai');

module.exports = async (req, res) => {
  const results = [];
  const models = [
    'llama-3.1-sonar-small-128k-chat',      // Fastest
    'llama-3.1-sonar-small-128k-online',    // Fast with search
    'llama-3.1-sonar-large-128k-chat',      // Slower
    'llama-3.1-sonar-large-128k-online'     // Slowest (current)
  ];

  const apiKey = process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'PERPLEXITY_API_KEY not set'
    });
  }

  const perplexity = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://api.perplexity.ai'
  });

  // Test each model
  for (const model of models) {
    const startTime = Date.now();
    
    try {
      console.log(`[Test] Trying model: ${model}`);
      
      const response = await perplexity.chat.completions.create({
        model: model,
        max_tokens: 50,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say "Working!" and nothing else.' }
        ]
      });

      const responseTime = Date.now() - startTime;
      const aiResponse = response.choices[0].message.content;

      console.log(`[Test] ✅ ${model} worked in ${responseTime}ms`);

      results.push({
        model: model,
        status: 'success',
        response_time: responseTime,
        ai_response: aiResponse
      });

      // If this model worked in under 5 seconds, use it!
      if (responseTime < 5000) {
        return res.status(200).json({
          success: true,
          recommended_model: model,
          response_time: responseTime,
          ai_response: aiResponse,
          all_results: results,
          message: `✅ Found working model: ${model} (${responseTime}ms)`
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.log(`[Test] ❌ ${model} failed: ${error.message}`);
      
      results.push({
        model: model,
        status: 'failed',
        response_time: responseTime,
        error: error.message
      });
    }
  }

  // Return all results
  return res.status(200).json({
    success: results.some(r => r.status === 'success'),
    all_results: results,
    message: 'Model test complete'
  });
};
