const OpenAI = require('openai');
const db = require('./db');

// Use Perplexity instead of expensive Anthropic
let perplexity = null;
function getPerplexity() {
  if (!perplexity && process.env.PERPLEXITY_API_KEY) {
    perplexity = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai'
    });
  }
  return perplexity;
}

/**
 * MEMORY RETENTION SYSTEM - MFS Bots
 *
 * This module implements conversation memory management using:
 * 1. Rolling window of recent messages (last 30 messages)
 * 2. Automated summarization of older messages
 * 3. Key facts extraction for long-term context
 */

/**
 * Build context for AI with memory management
 */
function buildContextWithMemory(conversationHistory, existingSummary = {}) {
  const messageCount = conversationHistory.length;
  const SUMMARIZE_THRESHOLD = 50;
  const KEEP_RECENT = 30;

  console.log(`[Memory] Building context: ${messageCount} messages total`);

  if (messageCount <= SUMMARIZE_THRESHOLD) {
    return {
      messages: conversationHistory,
      summary: existingSummary.conversation_summary || null,
      keyFacts: existingSummary.key_facts || {},
      needsUpdate: false
    };
  }

  const oldMessagesCount = messageCount - KEEP_RECENT;
  const recentMessages = conversationHistory.slice(-KEEP_RECENT);

  const lastSummarizedCount = existingSummary.message_count || 0;
  const needsUpdate = (messageCount - lastSummarizedCount) >= 10;

  console.log(`[Memory] Using summary for ${oldMessagesCount} old messages + ${KEEP_RECENT} recent`);
  console.log(`[Memory] Needs summary update: ${needsUpdate} (last: ${lastSummarizedCount}, now: ${messageCount})`);

  return {
    messages: recentMessages,
    summary: existingSummary.conversation_summary || null,
    keyFacts: existingSummary.key_facts || {},
    needsUpdate: needsUpdate,
    oldMessagesCount: oldMessagesCount,
    fullHistory: conversationHistory
  };
}

/**
 * Generate summary and extract key facts from conversation history
 */
async function generateSummaryAndFacts(messagesToSummarize, existingKeyFacts = {}) {
  console.log('[Memory] Generating summary for', messagesToSummarize.length, 'messages');

  try {
    const conversationText = messagesToSummarize
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const summaryPrompt = `Summarize this conversation concisely. Extract key facts about the user's goals, preferences, decisions, and important context. Format your response as JSON:

{
  "summary": "Brief 2-3 sentence summary of conversation so far",
  "key_facts": {
    "goals": ["user's stated goals"],
    "preferences": ["user's preferences"],
    "decisions_made": ["decisions made"],
    "important_context": ["other important facts"]
  }
}

Conversation:
${conversationText}

Previous key facts (build upon these):
${JSON.stringify(existingKeyFacts, null, 2)}`;

    const client = getPerplexity();
    if (!client) {
      throw new Error('PERPLEXITY_API_KEY not configured');
    }

    const response = await client.chat.completions.create({
      model: 'llama-3.1-sonar-small-128k-chat',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: summaryPrompt
      }]
    });

    const responseText = response.choices[0].message.content;

    let result;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('[Memory] Failed to parse summary JSON:', parseError);
      result = {
        summary: responseText,
        key_facts: existingKeyFacts
      };
    }

    console.log('[Memory] Summary generated:', result.summary.substring(0, 100));

    return {
      summary: result.summary,
      keyFacts: result.key_facts || existingKeyFacts
    };

  } catch (error) {
    console.error('[Memory] Error generating summary:', error);
    return {
      summary: `[Previous ${messagesToSummarize.length} messages]`,
      keyFacts: existingKeyFacts
    };
  }
}

/**
 * Build system prompt with memory context
 */
function buildSystemPromptWithMemory(baseSystemPrompt, summary, keyFacts) {
  if (!summary || Object.keys(keyFacts || {}).length === 0) {
    return baseSystemPrompt;
  }

  const memoryContext = `
CONVERSATION CONTEXT (Previous Messages):

Summary: ${summary}

Key Facts About User:
${Object.entries(keyFacts)
    .map(([category, items]) => `- ${category}: ${Array.isArray(items) ? items.join(', ') : items}`)
    .join('\n')}

---

Use this context to provide continuity in the conversation. Refer back to their goals, preferences, and previous decisions when relevant.

`;

  return memoryContext + baseSystemPrompt;
}

/**
 * Update conversation memory in database (PostgreSQL)
 */
async function updateConversationMemory(conversationId, summary, keyFacts, messageCount) {
  try {
    await db.query(
      `UPDATE ai_conversations SET conversation_summary = $1, key_facts = $2, message_count = $3, updated_at = $4 WHERE id = $5`,
      [summary, JSON.stringify(keyFacts), messageCount, new Date(), conversationId]
    );
    console.log('[Memory] Memory updated for conversation:', conversationId);
  } catch (error) {
    console.error('[Memory] Error updating memory:', error);
  }
}

/**
 * Complete memory management workflow
 */
async function processConversationMemory(conversationHistory, conversationId, existingSummary = {}) {
  const memoryContext = buildContextWithMemory(conversationHistory, existingSummary);

  if (memoryContext.needsUpdate && memoryContext.fullHistory) {
    const messagesToSummarize = memoryContext.fullHistory.slice(0, memoryContext.oldMessagesCount);

    const { summary, keyFacts } = await generateSummaryAndFacts(
      messagesToSummarize,
      memoryContext.keyFacts
    );

    if (conversationId) {
      updateConversationMemory(
        conversationId,
        summary,
        keyFacts,
        conversationHistory.length
      ).catch(err => console.error('[Memory] Background update failed:', err));
    }

    return {
      messages: memoryContext.messages,
      summary: summary,
      keyFacts: keyFacts
    };
  }

  return {
    messages: memoryContext.messages,
    summary: memoryContext.summary,
    keyFacts: memoryContext.keyFacts
  };
}

module.exports = {
  buildContextWithMemory,
  generateSummaryAndFacts,
  buildSystemPromptWithMemory,
  updateConversationMemory,
  processConversationMemory
};
