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
// MFS AI SECRETARY BOT
// Handles scheduling, client management, follow-ups, and administrative tasks
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

    // Verify user access
    if (userId) {
      const { data: user } = await supabase
        .from('users')
        .select('email, role')
        .eq('id', userId)
        .single();

      if (!user || (user.role !== 'admin' && user.email !== 'maggie@maggieforbesstrategies.com')) {
        console.log('[MFS Secretary] Access denied');
        return res.status(403).json({
          success: false,
          error: 'Access denied.',
          message: 'This bot is available to MFS admins only.'
        });
      }
    }

    console.log('[MFS Secretary] Processing message:', message.substring(0, 50));

    // Fetch relevant data for context
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, full_name, email, stage, client_type, updated_at')
      .eq('tenant_id', effectiveTenantId)
      .order('updated_at', { ascending: false })
      .limit(20);

    const { data: recentActivities } = await supabase
      .from('contact_activities')
      .select('id, contact_id, type, description, created_at')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: false })
      .limit(10);

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
          bot_type: 'secretary',
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

    // Build context summary
    const contactsByStage = {};
    contacts?.forEach(c => {
      const stage = c.stage || 'unknown';
      contactsByStage[stage] = (contactsByStage[stage] || 0) + 1;
    });

    const totalContacts = contacts?.length || 0;
    const mfsClients = contacts?.filter(c => c.client_type === 'mfs_client').length || 0;

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

    // System prompt for MFS AI Secretary
    const baseSystemPrompt = `You are the AI Executive Secretary for Maggie Forbes Strategies (MFS).

YOUR NAME: Sarah

YOUR ROLE:
You are Maggie's executive assistant, helping manage her consulting business operations, client relationships, scheduling, and administrative tasks.

ABOUT MAGGIE FORBES STRATEGIES:
- Strategic Growth Consulting for business owners
- Services: Growth Architecture, Strategic Planning, Business Development
- Consultation calls are the first step for new clients
- Discovery calls, Strategy sessions, and ongoing coaching follow

CURRENT DATA:
- Total Contacts: ${totalContacts}
- MFS Clients: ${mfsClients}
- Contacts by Stage: ${Object.entries(contactsByStage).map(([k, v]) => `${k}: ${v}`).join(', ')}

RECENT CONTACTS:
${contacts?.slice(0, 5).map(c => `- ${c.full_name} (${c.email}) - Stage: ${c.stage}`).join('\n') || 'No recent contacts'}

RECENT ACTIVITIES:
${recentActivities?.slice(0, 5).map(a => `- ${a.type}: ${a.description?.substring(0, 50)}...`).join('\n') || 'No recent activities'}

YOUR CAPABILITIES:
1. CLIENT MANAGEMENT
   - Look up client information
   - Summarize client history
   - Track client stages and progress
   - Flag clients needing follow-up

2. SCHEDULING ASSISTANCE
   - Help coordinate meeting times
   - Remind about upcoming consultations
   - Suggest follow-up timing
   - Track no-shows and reschedules

3. FOLLOW-UP MANAGEMENT
   - Identify clients needing contact
   - Draft follow-up message templates
   - Prioritize outreach based on stage
   - Track communication history

4. ADMINISTRATIVE TASKS
   - Summarize daily/weekly activity
   - Generate client reports
   - Organize client notes
   - Track pipeline status

5. TASK CREATION
   When you identify an action item, format it as:
   [TASK: description | priority: high/medium/low | due: timeframe]

   Example: [TASK: Follow up with John Smith about strategy session | priority: high | due: within 24 hours]

RESPONSE STYLE:
- Be efficient and professional
- Proactively identify issues or opportunities
- Present information clearly and concisely
- Offer to take action when appropriate
- Use bullet points for lists
- Keep responses focused and actionable

PROACTIVE BEHAVIORS:
- Alert Maggie to clients who haven't been contacted recently
- Highlight consultation calls coming up
- Flag any urgent follow-ups needed
- Summarize pipeline health when relevant

COMMUNICATION TONE:
- Professional and polished
- Efficient and organized
- Helpful and anticipatory
- Discreet with client information

When Maggie asks "What do I need to do today?" or similar:
1. List scheduled calls/meetings
2. Identify overdue follow-ups
3. Highlight hot leads needing attention
4. Note any urgent items`;

    // Load persistent context
    const { context: persistentContext } = await loadBotContext(effectiveTenantId, 'secretary');

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

    // Check for task creation
    let createdTasks = [];
    const taskMatches = aiResponse.matchAll(/\[TASK:\s*([^|]+)\s*\|\s*priority:\s*(\w+)\s*\|\s*due:\s*([^\]]+)\]/gi);

    for (const match of taskMatches) {
      const task = {
        description: match[1].trim(),
        priority: match[2].trim().toLowerCase(),
        due: match[3].trim()
      };

      console.log(`[MFS Secretary] Task identified:`, task);

      // Save task to database
      const { data: newTask, error: taskError } = await supabase
        .from('tasks')
        .insert([{
          tenant_id: effectiveTenantId,
          user_id: userId,
          title: task.description,
          priority: task.priority,
          due_date_text: task.due,
          status: 'pending',
          source: 'ai_secretary',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (!taskError && newTask) {
        createdTasks.push({
          id: newTask.id,
          title: task.description,
          priority: task.priority
        });
        console.log(`[MFS Secretary] Task saved: ${newTask.id}`);
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

    console.log('[MFS Secretary] Response generated');

    return res.status(200).json({
      success: true,
      message: aiResponse,
      conversationId: dbConversationId,
      createdTasks: createdTasks.length > 0 ? createdTasks : undefined,
      context: {
        totalContacts,
        mfsClients,
        contactsByStage
      }
    });

  } catch (error) {
    console.error('[MFS Secretary] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Sorry, I encountered an error.',
      message: 'Please try again.'
    });
  }
};
