const db = require('./utils/db');

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

  // Single-user system: tenant ID always from environment
  const TENANT_ID = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    // GET - List memories
    if (req.method === 'GET') {
      const { category } = req.query;

      let query = 'SELECT * FROM ai_memory_store WHERE tenant_id = $1';
      const params = [TENANT_ID];

      if (category) {
        query += ' AND category = $2';
        params.push(category);
      }

      query += ' ORDER BY category, key';

      const memories = await db.queryAll(query, params);

      return res.status(200).json({
        success: true,
        memories: memories || []
      });
    }

    // POST - Create or Update memory
    if (req.method === 'POST') {
      const { category, key, value } = req.body;

      if (!category || !key) {
        return res.status(400).json({ error: 'Category and key are required' });
      }

      // Check if memory exists
      const existing = await db.queryOne(
        'SELECT id FROM ai_memory_store WHERE tenant_id = $1 AND category = $2 AND key = $3',
        [TENANT_ID, category, key]
      );

      let result;

      if (existing) {
        // Update existing
        result = await db.queryOne(
          'UPDATE ai_memory_store SET value = $1, last_updated = $2 WHERE id = $3 RETURNING *',
          [value, new Date(), existing.id]
        );
      } else {
        // Create new
        result = await db.insert('ai_memory_store', {
          tenant_id: TENANT_ID,
          category,
          key,
          value,
          last_updated: new Date()
        });
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
        await db.query('DELETE FROM ai_memory_store WHERE id = $1 AND tenant_id = $2', [id, TENANT_ID]);
      } else if (category && key) {
        await db.query(
          'DELETE FROM ai_memory_store WHERE tenant_id = $1 AND category = $2 AND key = $3',
          [TENANT_ID, category, key]
        );
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
