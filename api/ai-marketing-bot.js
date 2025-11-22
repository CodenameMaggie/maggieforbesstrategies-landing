const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { processConversationMemory, buildSystemPromptWithMemory } = require('./utils/memory-manager');
const { loadBotContext, injectContextIntoPrompt } = require('./utils/context-loader-helper');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// MFS MARKETING BOT
// Handles marketing strategy, content creation, social media posts
// For Maggie Forbes Strategies
// ============================================

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST to chat.'
    });
  }

  try {
    const { message, conversationId, tenantId, userId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const effectiveTenantId = tenantId || process.env.MFS_TENANT_ID;

    // Verify user access (MFS admin only)
    if (userId) {
      const { data: user } = await supabase
        .from('users')
        .select('email, role')
        .eq('id', userId)
        .single();

      if (!user || (user.role !== 'admin' && user.email !== 'maggie@maggieforbesstrategies.com')) {
        console.log('[MFS Marketing] Access denied');
        return res.status(403).json({
          success: false,
          error: 'Access denied.',
          message: 'This bot is available to MFS admins only.'
        });
      }
    }

    console.log('[MFS Marketing] Processing message:', message.substring(0, 50));

    // Get conversation history
    let conversationHistory = [];
    let dbConversationId = conversationId;
    let conversation = null;

    if (conversationId) {
      const { data: conv } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('tenant_id', effectiveTenantId)
        .single();

      if (conv) {
        conversation = conv;
        conversationHistory = conv.messages || [];
      }
    } else {
      const { data: newConversation } = await supabase
        .from('ai_conversations')
        .insert([{
          tenant_id: effectiveTenantId,
          user_id: userId,
          bot_type: 'marketing',
          started_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          messages: [],
          message_count: 0,
          conversation_summary: null,
          key_facts: {},
          status: 'active',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (newConversation) {
        conversation = newConversation;
        dbConversationId = newConversation.id;
      }
    }

    // Add user message to history
    conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Process conversation with memory management
    const memoryContext = await processConversationMemory(
      supabase,
      conversationHistory,
      dbConversationId,
      {
        conversation_summary: conversation?.conversation_summary,
        key_facts: conversation?.key_facts,
        message_count: conversation?.message_count
      }
    );

    // Build Claude messages array
    const claudeMessages = memoryContext.messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }));

    // System prompt for MFS Marketing Bot
    const baseSystemPrompt = `You are the Marketing Assistant for Maggie Forbes Strategies (MFS).

YOUR ROLE:
You help Maggie with marketing strategy, content creation, and social media management for her strategic growth consulting business.

ABOUT MAGGIE FORBES STRATEGIES:
- Strategic Growth Consulting for business owners
- Services: Growth Architecture, Strategic Planning, Business Development
- Target clients: Established business owners ready to scale
- Brand voice: Professional, confident, empowering, strategic
- Key message: "Transform your business vision into scalable reality"

YOUR CAPABILITIES:
- Create social media posts (LinkedIn, Twitter, Facebook)
- Develop marketing strategies
- Write email campaigns
- Create content calendars
- Suggest lead generation tactics
- Analyze marketing approaches

SOCIAL MEDIA POST CREATION:
When asked to create a post:
1. Generate engaging content for the specified platform
2. Use appropriate length (LinkedIn: 1300 chars, Twitter: 280 chars, Facebook: 400 chars)
3. Include relevant hashtags
4. Match Maggie's professional, strategic brand voice
5. Format: Signal with [CREATE_POST:platform] where platform is linkedin/twitter/facebook

Example:
User: "Create a LinkedIn post about strategic planning"
Response: "[CREATE_POST:linkedin] Strategic planning isn't just about where you want to go...

[post content here]

#StrategicGrowth #BusinessStrategy #MaggieForbesStrategies"

BRAND VOICE GUIDELINES:
- Professional and polished
- Confident but not arrogant
- Strategic and thoughtful
- Empowering and action-oriented
- Focus on transformation and results
- Avoid: Fluffy language, excessive emojis, salesy tone

RESPONSE STYLE:
- Be consultative - present options when appropriate
- Provide strategic reasoning behind recommendations
- Keep responses concise but valuable
- Tailor advice to B2B consulting context
- Reference MFS services when relevant

SPECIALTIES:
- B2B consulting marketing
- Thought leadership content
- LinkedIn strategy
- Email nurture sequences
- Webinar/workshop promotion
- Case study development`;

    // Load persistent context
    const { context: persistentContext } = await loadBotContext(effectiveTenantId, 'marketing');

    // Build enhanced system prompt
    let enhancedPrompt = injectContextIntoPrompt(baseSystemPrompt, persistentContext);
    const systemPrompt = buildSystemPromptWithMemory(
      enhancedPrompt,
      memoryContext.summary,
      memoryContext.keyFacts
    );

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: claudeMessages
    });

    const aiResponse = response.content[0].text;

    // Check if AI created a social media post
    let createdPost = null;
    const postMatch = aiResponse.match(/\[CREATE_POST:(linkedin|twitter|facebook)\]\s*([\s\S]*)/i);

    if (postMatch) {
      const platform = postMatch[1].toLowerCase();
      const postContent = postMatch[2].trim();

      console.log(`[MFS Marketing] Creating ${platform} post...`);

      const { data: newPost, error: postError } = await supabase
        .from('social_posts')
        .insert([{
          tenant_id: effectiveTenantId,
          user_id: userId,
          platform: platform,
          post_type: 'ai_generated',
          content: postContent,
          status: 'draft',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (!postError && newPost) {
        createdPost = {
          id: newPost.id,
          platform: platform,
          content: postContent,
          status: 'draft'
        };
        console.log(`[MFS Marketing] Post saved: ${newPost.id}`);
      } else {
        console.error('[MFS Marketing] Error saving post:', postError);
      }
    }

    // Add AI response to history
    conversationHistory.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    });

    // Update conversation in database
    if (dbConversationId) {
      await supabase
        .from('ai_conversations')
        .update({
          messages: conversationHistory,
          message_count: conversationHistory.length,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', dbConversationId);
    }

    console.log('[MFS Marketing] Response generated');

    return res.status(200).json({
      success: true,
      message: aiResponse,
      conversationId: dbConversationId,
      createdPost: createdPost
    });

  } catch (error) {
    console.error('[MFS Marketing] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Sorry, I encountered an error.',
      message: 'Please try again.'
    });
  }
};
