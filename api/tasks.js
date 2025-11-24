const db = require('./utils/db');

/**
 * MFS Tasks API
 * GET - List tasks
 * POST - Create task
 * PATCH - Update task
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'] || process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    // GET - List tasks
    if (req.method === 'GET') {
      const { status, priority, limit = 50 } = req.query;

      let query = 'SELECT * FROM tasks WHERE tenant_id = $1';
      const params = [tenantId];
      let paramIndex = 2;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (priority) {
        query += ` AND priority = $${paramIndex}`;
        params.push(priority);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit));

      const tasks = await db.queryAll(query, params);

      return res.status(200).json({
        success: true,
        tasks: tasks || []
      });
    }

    // POST - Create task
    if (req.method === 'POST') {
      const { title, description, priority, due_date_text, contact_id } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const task = await db.insert('tasks', {
        tenant_id: tenantId,
        title,
        description,
        priority: priority || 'medium',
        status: 'pending',
        due_date_text,
        contact_id,
        source: 'manual',
        created_at: new Date(),
        updated_at: new Date()
      });

      return res.status(201).json({
        success: true,
        task
      });
    }

    // PATCH - Update task
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Task ID is required' });
      }

      updates.updated_at = new Date();

      if (updates.status === 'completed') {
        updates.completed_at = new Date();
      }

      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      const query = `UPDATE tasks SET ${setClause} WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} RETURNING *`;
      const result = await db.queryOne(query, [...values, id, tenantId]);

      return res.status(200).json({
        success: true,
        task: result
      });
    }

    // DELETE - Delete task
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Task ID is required' });
      }

      await db.query('DELETE FROM tasks WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

      return res.status(200).json({
        success: true,
        message: 'Task deleted'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[MFS Tasks] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
