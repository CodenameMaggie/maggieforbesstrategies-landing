const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * CONTEXT LOADER HELPER - MFS Bots
 * Auto-loads relevant memories from ai_memory_store for bot conversations
 */

/**
 * Load context memories for a specific bot type
 */
async function loadBotContext(tenantId, botType) {
  try {
    console.log(`[Context Loader] Loading context for ${botType} bot`);

    const categories = getBotCategories(botType);

    const { data: memories, error } = await supabase
      .from('ai_memory_store')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('category', categories)
      .order('category')
      .order('last_updated', { ascending: false });

    if (error) {
      console.error('[Context Loader] Error loading memories:', error);
      return { context: '', memories: [] };
    }

    if (!memories || memories.length === 0) {
      console.log('[Context Loader] No memories found for', botType);
      return { context: '', memories: [] };
    }

    console.log(`[Context Loader] Loaded ${memories.length} memories for ${botType}`);

    const context = formatContextForBot(memories);

    return { context, memories };

  } catch (error) {
    console.error('[Context Loader] Error:', error);
    return { context: '', memories: [] };
  }
}

/**
 * Get relevant categories for each bot type
 */
function getBotCategories(botType) {
  const categoryMap = {
    'marketing': ['business', 'marketing', 'active_projects', 'brand_voice'],
    'secretary': ['business', 'calendar', 'contacts', 'active_projects'],
    'assistant': ['business', 'marketing', 'active_projects']
  };

  return categoryMap[botType] || ['business', 'active_projects'];
}

/**
 * Format memories into a context string for injection into system prompt
 */
function formatContextForBot(memories) {
  if (!memories || memories.length === 0) {
    return '';
  }

  let context = '\n\n**PERSISTENT MEMORY CONTEXT**\n\n';
  context += '*This information persists across all conversations. Use it to maintain consistency and continuity.*\n\n';

  const grouped = {};
  memories.forEach(memory => {
    if (!grouped[memory.category]) {
      grouped[memory.category] = [];
    }
    grouped[memory.category].push(memory);
  });

  Object.keys(grouped).sort().forEach(category => {
    context += `### ${category.toUpperCase().replace('_', ' ')}\n\n`;

    grouped[category].forEach(memory => {
      context += `**${memory.key}:**\n`;

      if (typeof memory.value === 'object') {
        if (memory.value.content && Object.keys(memory.value).length === 1) {
          context += `${memory.value.content}\n\n`;
        } else if (memory.value.description || memory.value.summary) {
          context += `${memory.value.description || memory.value.summary}\n`;

          if (memory.value.items || memory.value.list) {
            const items = memory.value.items || memory.value.list;
            if (Array.isArray(items)) {
              items.forEach(item => context += `- ${item}\n`);
            }
          }
          context += '\n';
        } else {
          context += `${JSON.stringify(memory.value, null, 2)}\n\n`;
        }
      } else {
        context += `${memory.value}\n\n`;
      }
    });
  });

  context += `*Use this context to provide consistent, informed responses. Reference these memories when relevant.*\n\n`;
  context += '---\n\n';

  return context;
}

/**
 * Inject context into system prompt
 */
function injectContextIntoPrompt(baseSystemPrompt, context) {
  if (!context) {
    return baseSystemPrompt;
  }

  return context + baseSystemPrompt;
}

module.exports = {
  loadBotContext,
  injectContextIntoPrompt,
  getBotCategories,
  formatContextForBot
};
