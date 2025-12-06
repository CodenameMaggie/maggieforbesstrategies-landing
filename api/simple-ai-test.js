const OpenAI = require('openai');

module.exports = async (req, res) => {
  try {
    if (!process.env.PERPLEXITY_API_KEY) {
      return res.json({ success: false, error: 'No PERPLEXITY_API_KEY' });
    }

    const perplexity = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai'
    });

    const start = Date.now();
    const response = await perplexity.chat.completions.create({
      model: 'llama-3.1-sonar-small-128k-chat',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Say "Hello! I am working!"' }
      ]
    });
    const elapsed = Date.now() - start;

    return res.json({
      success: true,
      response: response.choices[0].message.content,
      time_ms: elapsed,
      model: 'llama-3.1-sonar-small-128k-chat'
    });
  } catch (err) {
    return res.json({
      success: false,
      error: err.message,
      type: err.constructor.name
    });
  }
};
