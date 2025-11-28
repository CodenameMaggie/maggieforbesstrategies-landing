const db = require('./utils/db');

/**
 * THOUGHT LEADERSHIP HUB API
 * Manage high-value content for enterprise client acquisition
 *
 * GET - List content pieces & speaking opportunities
 * POST - Create content or speaking opportunity
 * PATCH - Update content/opportunity
 * DELETE - Delete content/opportunity
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const TENANT_ID = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    // GET - List content & speaking opportunities
    if (req.method === 'GET') {
      const { type, status } = req.query;

      // Get content pieces
      if (!type || type === 'content') {
        let query = 'SELECT * FROM thought_leadership_content WHERE tenant_id = $1';
        const params = [TENANT_ID];

        if (status) {
          query += ' AND status = $2';
          params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const content = await db.queryAll(query, params);

        return res.status(200).json({
          success: true,
          content: content || []
        });
      }

      // Get speaking opportunities
      if (type === 'speaking') {
        let query = 'SELECT * FROM speaking_opportunities WHERE tenant_id = $1';
        const params = [TENANT_ID];

        if (status) {
          query += ' AND status = $2';
          params.push(status);
        }

        query += ' ORDER BY event_date DESC';

        const opportunities = await db.queryAll(query, params);

        return res.status(200).json({
          success: true,
          opportunities: opportunities || []
        });
      }

      // Get dashboard stats
      if (type === 'stats') {
        const stats = await db.queryOne(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'published') as published_count,
            COUNT(*) FILTER (WHERE status = 'draft') as draft_count,
            COALESCE(SUM(views), 0) as total_views,
            COALESCE(SUM(leads_generated), 0) as total_leads
          FROM thought_leadership_content
          WHERE tenant_id = $1
        `, [TENANT_ID]);

        const speakingStats = await db.queryOne(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'accepted') as accepted_count,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
            COALESCE(SUM(leads_generated), 0) as total_leads,
            COALESCE(SUM(follow_up_meetings), 0) as total_meetings
          FROM speaking_opportunities
          WHERE tenant_id = $1
        `, [TENANT_ID]);

        return res.status(200).json({
          success: true,
          stats: {
            content: {
              published: parseInt(stats?.published_count || 0),
              drafts: parseInt(stats?.draft_count || 0),
              totalViews: parseInt(stats?.total_views || 0),
              totalLeads: parseInt(stats?.total_leads || 0)
            },
            speaking: {
              accepted: parseInt(speakingStats?.accepted_count || 0),
              completed: parseInt(speakingStats?.completed_count || 0),
              totalLeads: parseInt(speakingStats?.total_leads || 0),
              totalMeetings: parseInt(speakingStats?.total_meetings || 0)
            }
          }
        });
      }
    }

    // POST - Create content or speaking opportunity
    if (req.method === 'POST') {
      const { type, ...data } = req.body;

      if (type === 'content') {
        const { title, content_type, summary, body, key_insights, target_audience, industry_focus, keywords } = data;

        if (!title || !content_type) {
          return res.status(400).json({ success: false, error: 'Title and content_type are required' });
        }

        const content = await db.insert('thought_leadership_content', {
          tenant_id: TENANT_ID,
          title,
          content_type,
          summary,
          body,
          key_insights: key_insights ? JSON.stringify(key_insights) : null,
          target_audience,
          industry_focus,
          keywords: keywords || [],
          status: 'draft',
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.status(201).json({
          success: true,
          content
        });
      }

      if (type === 'speaking') {
        const { event_name, event_type, event_date, event_url, topic, audience_size, audience_type, organizer_name, organizer_email, organizer_company } = data;

        if (!event_name) {
          return res.status(400).json({ success: false, error: 'Event name is required' });
        }

        const opportunity = await db.insert('speaking_opportunities', {
          tenant_id: TENANT_ID,
          event_name,
          event_type,
          event_date: event_date ? new Date(event_date) : null,
          event_url,
          topic,
          audience_size,
          audience_type,
          organizer_name,
          organizer_email,
          organizer_company,
          status: 'prospect',
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.status(201).json({
          success: true,
          opportunity
        });
      }

      return res.status(400).json({ success: false, error: 'Invalid type. Must be "content" or "speaking"' });
    }

    // PATCH - Update content or speaking opportunity
    if (req.method === 'PATCH') {
      const { type, id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'ID is required' });
      }

      updates.updated_at = new Date();

      // If publishing, set published_at
      if (updates.status === 'published' && type === 'content') {
        updates.published_at = new Date();
      }

      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      const tableName = type === 'content' ? 'thought_leadership_content' : 'speaking_opportunities';
      const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} RETURNING *`;

      const result = await db.queryOne(query, [...values, id, TENANT_ID]);

      return res.status(200).json({
        success: true,
        [type]: result
      });
    }

    // DELETE - Delete content or speaking opportunity
    if (req.method === 'DELETE') {
      const { type, id } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, error: 'ID is required' });
      }

      const tableName = type === 'content' ? 'thought_leadership_content' : 'speaking_opportunities';
      await db.query(`DELETE FROM ${tableName} WHERE id = $1 AND tenant_id = $2`, [id, TENANT_ID]);

      return res.status(200).json({
        success: true,
        message: `${type} deleted successfully`
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('[Thought Leadership] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
