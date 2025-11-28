const db = require('./utils/db');

/**
 * MFS Contacts API
 * GET - List contacts
 * POST - Create contact
 * PATCH - Update contact
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tenant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Single-user system: tenant ID always from environment
  const TENANT_ID = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    // GET - List contacts
    if (req.method === 'GET') {
      const { stage, limit = 50 } = req.query;

      let query = 'SELECT * FROM contacts WHERE tenant_id = $1';
      const params = [TENANT_ID];

      if (stage) {
        query += ' AND stage = $2';
        params.push(stage);
      }

      const limitParamIndex = params.length + 1;
      query += ` ORDER BY updated_at DESC LIMIT $${limitParamIndex}`;
      params.push(parseInt(limit));

      const contacts = await db.queryAll(query, params);

      return res.status(200).json({
        success: true,
        contacts: contacts || []
      });
    }

    // POST - Create contact
    if (req.method === 'POST') {
      const { full_name, email, phone, company, stage, lead_source, notes } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      // Parse name
      const nameParts = (full_name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const contact = await db.insert('contacts', {
        tenant_id: TENANT_ID,
        full_name,
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase(),
        phone,
        company,
        stage: stage || 'new',
        lead_source,
        notes,
        client_type: 'mfs_client',
        created_at: new Date(),
        updated_at: new Date()
      });

      return res.status(201).json({
        success: true,
        contact
      });
    }

    // PATCH - Update contact
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Contact ID is required' });
      }

      updates.updated_at = new Date();

      // Build update query
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      const query = `UPDATE contacts SET ${setClause} WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} RETURNING *`;
      const result = await db.queryOne(query, [...values, id, TENANT_ID]);

      return res.status(200).json({
        success: true,
        contact: result
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[MFS Contacts] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
