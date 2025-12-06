/**
 * Simple Perplexity API Test Endpoint
 * Tests if Perplexity API key is working without database dependencies
 */

const OpenAI = require('openai');

module.exports = async (req, res) => {
  try {
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'PERPLEXITY_API_KEY not set in environment',
        env_check: {
          PERPLEXITY_API_KEY: 'Missing',
          key_length: 0
        }
      });
    }

    // Test Perplexity API
    const perplexity = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.perplexity.ai'
    });

    console.log('[Test] Calling Perplexity API...');

    const response = await perplexity.chat.completions.create({
      model: 'llama-3.1-sonar-large-128k-online',
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Hello! I am working!" and nothing else.' }
      ]
    });

    const aiResponse = response.choices[0].message.content;

    console.log('[Test] Perplexity responded:', aiResponse);

    return res.status(200).json({
      success: true,
      message: 'Perplexity API is working!',
      ai_response: aiResponse,
      env_check: {
        PERPLEXITY_API_KEY: 'Set ✅',
        key_length: apiKey.length,
        key_prefix: apiKey.substring(0, 7) + '...'
      },
      model: 'llama-3.1-sonar-large-128k-online'
    });

  } catch (error) {
    console.error('[Test] Perplexity API Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
      error_type: error.constructor.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
