const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * MFS Memory Store API
 * GET - List memories
 * POST - Create/Update memory
 * DELETE - Delete memory
 */
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'] || process.env.MFS_TENANT_ID;

  try {
    // GET - List memories
    if (req.method === 'GET') {
      const { category } = req.query;

      let query = supabase
        .from('ai_memory_store')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('category')
        .order('key');

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json({
        success: true,
        memories: data || []
      });
    }

    // POST - Create or Update memory
    if (req.method === 'POST') {
      const { category, key, value } = req.body;

      if (!category || !key) {
        return res.status(400).json({ error: 'Category and key are required' });
      }

      // Check if memory exists
      const { data: existing } = await supabase
        .from('ai_memory_store')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('category', category)
        .eq('key', key)
        .single();

      let result;

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('ai_memory_store')
          .update({
            value,
            last_updated: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('ai_memory_store')
          .insert({
            tenant_id: tenantId,
            category,
            key,
            value,
            last_updated: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return res.status(200).json({
        success: true,
        memory: result
      });
    }

    // DELETE - Delete memory
    if (req.method === 'DELETE') {
      const { id, category, key } = req.query;

      if (id) {
        const { error } = await supabase
          .from('ai_memory_store')
          .delete()
          .eq('id', id)
          .eq('tenant_id', tenantId);

        if (error) throw error;
      } else if (category && key) {
        const { error } = await supabase
          .from('ai_memory_store')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('category', category)
          .eq('key', key);

        if (error) throw error;
      } else {
        return res.status(400).json({ error: 'ID or category+key required' });
      }

      return res.status(200).json({
        success: true,
        message: 'Memory deleted'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[MFS Memory] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
