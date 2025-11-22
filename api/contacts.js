const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

  const tenantId = req.query.tenant_id || req.headers['x-tenant-id'] || process.env.MFS_TENANT_ID;

  try {
    // GET - List contacts
    if (req.method === 'GET') {
      const { stage, limit = 50 } = req.query;

      let query = supabase
        .from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(parseInt(limit));

      if (stage) {
        query = query.eq('stage', stage);
      }

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json({
        success: true,
        contacts: data || []
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

      const { data, error } = await supabase
        .from('contacts')
        .insert({
          tenant_id: tenantId,
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        contact: data
      });
    }

    // PATCH - Update contact
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Contact ID is required' });
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        contact: data
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
