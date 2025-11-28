const db = require('./utils/db');

/**
 * ABM (ACCOUNT-BASED MARKETING) API
 * Manage enterprise account targeting and multi-touch campaigns
 *
 * GET - List accounts, stakeholders, campaigns, touchpoints
 * POST - Create account/stakeholder/campaign/touchpoint
 * PATCH - Update records
 * DELETE - Delete records
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
    // GET - List data
    if (req.method === 'GET') {
      const { type, account_id, campaign_id, status, priority } = req.query;

      // Get target accounts
      if (type === 'accounts' || !type) {
        let query = 'SELECT * FROM abm_target_accounts WHERE tenant_id = $1';
        const params = [TENANT_ID];
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

        query += ' ORDER BY priority DESC, updated_at DESC';

        const accounts = await db.queryAll(query, params);

        return res.status(200).json({
          success: true,
          accounts: accounts || []
        });
      }

      // Get stakeholders for an account
      if (type === 'stakeholders') {
        if (!account_id) {
          return res.status(400).json({ success: false, error: 'account_id is required for stakeholders' });
        }

        const stakeholders = await db.queryAll(
          'SELECT * FROM abm_stakeholders WHERE tenant_id = $1 AND account_id = $2 ORDER BY created_at DESC',
          [TENANT_ID, account_id]
        );

        return res.status(200).json({
          success: true,
          stakeholders: stakeholders || []
        });
      }

      // Get campaigns
      if (type === 'campaigns') {
        let query = 'SELECT * FROM abm_campaigns WHERE tenant_id = $1';
        const params = [TENANT_ID];

        if (status) {
          query += ' AND status = $2';
          params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const campaigns = await db.queryAll(query, params);

        return res.status(200).json({
          success: true,
          campaigns: campaigns || []
        });
      }

      // Get touchpoints
      if (type === 'touchpoints') {
        let query = 'SELECT t.*, s.full_name as stakeholder_name, a.company_name FROM abm_touchpoints t LEFT JOIN abm_stakeholders s ON t.stakeholder_id = s.id LEFT JOIN abm_target_accounts a ON t.account_id = a.id WHERE t.tenant_id = $1';
        const params = [TENANT_ID];
        let paramIndex = 2;

        if (campaign_id) {
          query += ` AND t.campaign_id = $${paramIndex}`;
          params.push(campaign_id);
          paramIndex++;
        }

        if (account_id) {
          query += ` AND t.account_id = $${paramIndex}`;
          params.push(account_id);
          paramIndex++;
        }

        query += ' ORDER BY t.scheduled_date DESC';

        const touchpoints = await db.queryAll(query, params);

        return res.status(200).json({
          success: true,
          touchpoints: touchpoints || []
        });
      }

      // Get stats
      if (type === 'stats') {
        const accountStats = await db.queryOne(`
          SELECT
            COUNT(*) as total_accounts,
            COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
            COUNT(*) FILTER (WHERE status = 'engaged') as engaged,
            COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
            COUNT(*) FILTER (WHERE status = 'proposal') as in_proposal,
            COALESCE(SUM(estimated_deal_value), 0) as total_pipeline_value
          FROM abm_target_accounts
          WHERE tenant_id = $1
        `, [TENANT_ID]);

        const campaignStats = await db.queryOne(`
          SELECT
            COUNT(*) as total_campaigns,
            COUNT(*) FILTER (WHERE status = 'active') as active_campaigns,
            COALESCE(SUM(meetings_booked), 0) as total_meetings,
            COALESCE(SUM(opportunities_created), 0) as total_opportunities
          FROM abm_campaigns
          WHERE tenant_id = $1
        `, [TENANT_ID]);

        return res.status(200).json({
          success: true,
          stats: {
            accounts: {
              total: parseInt(accountStats?.total_accounts || 0),
              highPriority: parseInt(accountStats?.high_priority || 0),
              engaged: parseInt(accountStats?.engaged || 0),
              qualified: parseInt(accountStats?.qualified || 0),
              inProposal: parseInt(accountStats?.in_proposal || 0),
              pipelineValue: parseFloat(accountStats?.total_pipeline_value || 0)
            },
            campaigns: {
              total: parseInt(campaignStats?.total_campaigns || 0),
              active: parseInt(campaignStats?.active_campaigns || 0),
              meetings: parseInt(campaignStats?.total_meetings || 0),
              opportunities: parseInt(campaignStats?.total_opportunities || 0)
            }
          }
        });
      }
    }

    // POST - Create new record
    if (req.method === 'POST') {
      const { type, ...data } = req.body;

      // Create target account
      if (type === 'account') {
        const { company_name, company_domain, industry, company_size, annual_revenue, priority, estimated_deal_value, pain_points, our_fit_score, buying_signals } = data;

        if (!company_name) {
          return res.status(400).json({ success: false, error: 'Company name is required' });
        }

        const account = await db.insert('abm_target_accounts', {
          tenant_id: TENANT_ID,
          company_name,
          company_domain,
          industry,
          company_size,
          annual_revenue,
          priority: priority || 'medium',
          estimated_deal_value,
          pain_points,
          our_fit_score,
          buying_signals: buying_signals ? JSON.stringify(buying_signals) : null,
          status: 'prospecting',
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.status(201).json({
          success: true,
          account
        });
      }

      // Create stakeholder
      if (type === 'stakeholder') {
        const { account_id, full_name, title, role_type, email, linkedin_url, phone, engagement_level, interests, pain_points } = data;

        if (!account_id || !full_name) {
          return res.status(400).json({ success: false, error: 'Account ID and full name are required' });
        }

        const stakeholder = await db.insert('abm_stakeholders', {
          tenant_id: TENANT_ID,
          account_id,
          full_name,
          title,
          role_type,
          email,
          linkedin_url,
          phone,
          engagement_level: engagement_level || 'cold',
          interests: interests ? JSON.stringify(interests) : null,
          pain_points,
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.status(201).json({
          success: true,
          stakeholder
        });
      }

      // Create campaign
      if (type === 'campaign') {
        const { campaign_name, campaign_type, target_accounts, target_personas, objective, key_message, content_themes, start_date, end_date } = data;

        if (!campaign_name) {
          return res.status(400).json({ success: false, error: 'Campaign name is required' });
        }

        const campaign = await db.insert('abm_campaigns', {
          tenant_id: TENANT_ID,
          campaign_name,
          campaign_type,
          target_accounts: target_accounts ? JSON.stringify(target_accounts) : null,
          target_personas: target_personas ? JSON.stringify(target_personas) : null,
          objective,
          key_message,
          content_themes: content_themes ? JSON.stringify(content_themes) : null,
          start_date: start_date ? new Date(start_date) : null,
          end_date: end_date ? new Date(end_date) : null,
          status: 'draft',
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.status(201).json({
          success: true,
          campaign
        });
      }

      // Create touchpoint
      if (type === 'touchpoint') {
        const { campaign_id, account_id, stakeholder_id, touchpoint_type, subject, message, scheduled_date } = data;

        if (!account_id || !touchpoint_type) {
          return res.status(400).json({ success: false, error: 'Account ID and touchpoint type are required' });
        }

        const touchpoint = await db.insert('abm_touchpoints', {
          tenant_id: TENANT_ID,
          campaign_id,
          account_id,
          stakeholder_id,
          touchpoint_type,
          subject,
          message,
          scheduled_date: scheduled_date ? new Date(scheduled_date) : new Date(),
          status: 'planned',
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.status(201).json({
          success: true,
          touchpoint
        });
      }

      return res.status(400).json({ success: false, error: 'Invalid type' });
    }

    // PATCH - Update record
    if (req.method === 'PATCH') {
      const { type, id, ...updates } = req.body;

      if (!id || !type) {
        return res.status(400).json({ success: false, error: 'ID and type are required' });
      }

      updates.updated_at = new Date();

      const tableMap = {
        account: 'abm_target_accounts',
        stakeholder: 'abm_stakeholders',
        campaign: 'abm_campaigns',
        touchpoint: 'abm_touchpoints'
      };

      const tableName = tableMap[type];
      if (!tableName) {
        return res.status(400).json({ success: false, error: 'Invalid type' });
      }

      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} RETURNING *`;
      const result = await db.queryOne(query, [...values, id, TENANT_ID]);

      return res.status(200).json({
        success: true,
        [type]: result
      });
    }

    // DELETE - Delete record
    if (req.method === 'DELETE') {
      const { type, id } = req.query;

      if (!id || !type) {
        return res.status(400).json({ success: false, error: 'ID and type are required' });
      }

      const tableMap = {
        account: 'abm_target_accounts',
        stakeholder: 'abm_stakeholders',
        campaign: 'abm_campaigns',
        touchpoint: 'abm_touchpoints'
      };

      const tableName = tableMap[type];
      if (!tableName) {
        return res.status(400).json({ success: false, error: 'Invalid type' });
      }

      await db.query(`DELETE FROM ${tableName} WHERE id = $1 AND tenant_id = $2`, [id, TENANT_ID]);

      return res.status(200).json({
        success: true,
        message: `${type} deleted successfully`
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('[ABM] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
