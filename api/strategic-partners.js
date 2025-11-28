const db = require('./utils/db');

/**
 * STRATEGIC PARTNERS API
 * Manage referral partners: PE firms, conference organizers, complementary consultants
 *
 * GET - List partners and activities
 * POST - Create partner or activity
 * PATCH - Update partner
 * DELETE - Delete partner
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
    // GET - List partners or activities
    if (req.method === 'GET') {
      const { type, partner_type, tier, partnership_status, partner_id } = req.query;

      // Get partners
      if (type === 'partners' || !type) {
        let query = 'SELECT * FROM strategic_partners WHERE tenant_id = $1';
        const params = [TENANT_ID];
        let paramIndex = 2;

        if (partner_type) {
          query += ` AND partner_type = $${paramIndex}`;
          params.push(partner_type);
          paramIndex++;
        }

        if (tier) {
          query += ` AND tier = $${paramIndex}`;
          params.push(tier);
          paramIndex++;
        }

        if (partnership_status) {
          query += ` AND partnership_status = $${paramIndex}`;
          params.push(partnership_status);
          paramIndex++;
        }

        query += ' ORDER BY tier DESC, last_contact_date DESC NULLS LAST';

        const partners = await db.queryAll(query, params);

        return res.status(200).json({
          success: true,
          partners: partners || []
        });
      }

      // Get activities for a partner
      if (type === 'activities') {
        let query = 'SELECT * FROM partner_activities WHERE tenant_id = $1';
        const params = [TENANT_ID];

        if (partner_id) {
          query += ' AND partner_id = $2';
          params.push(partner_id);
        }

        query += ' ORDER BY activity_date DESC';

        const activities = await db.queryAll(query, params);

        return res.status(200).json({
          success: true,
          activities: activities || []
        });
      }

      // Get stats
      if (type === 'stats') {
        const partnerStats = await db.queryOne(`
          SELECT
            COUNT(*) as total_partners,
            COUNT(*) FILTER (WHERE tier = 'strategic') as strategic_partners,
            COUNT(*) FILTER (WHERE tier = 'active') as active_partners,
            COUNT(*) FILTER (WHERE partnership_status = 'active') as partnerships_active,
            COALESCE(SUM(total_referrals), 0) as total_referrals,
            COALESCE(SUM(total_revenue_generated), 0) as total_revenue
          FROM strategic_partners
          WHERE tenant_id = $1
        `, [TENANT_ID]);

        const typeBreakdown = await db.queryAll(`
          SELECT
            partner_type,
            COUNT(*) as count,
            COALESCE(SUM(total_referrals), 0) as referrals,
            COALESCE(SUM(total_revenue_generated), 0) as revenue
          FROM strategic_partners
          WHERE tenant_id = $1
          GROUP BY partner_type
        `, [TENANT_ID]);

        return res.status(200).json({
          success: true,
          stats: {
            total: parseInt(partnerStats?.total_partners || 0),
            strategic: parseInt(partnerStats?.strategic_partners || 0),
            active: parseInt(partnerStats?.active_partners || 0),
            partnershipsActive: parseInt(partnerStats?.partnerships_active || 0),
            totalReferrals: parseInt(partnerStats?.total_referrals || 0),
            totalRevenue: parseFloat(partnerStats?.total_revenue || 0),
            byType: typeBreakdown || []
          }
        });
      }
    }

    // POST - Create partner or activity
    if (req.method === 'POST') {
      const { type, ...data } = req.body;

      // Create partner
      if (type === 'partner') {
        const {
          partner_type,
          company_name,
          company_domain,
          contact_name,
          contact_title,
          contact_email,
          contact_linkedin,
          contact_phone,
          focus_area,
          geography,
          potential_referral_volume,
          avg_deal_size,
          referral_quality_score,
          partnership_terms,
          referral_fee_structure,
          why_good_fit,
          mutual_connections
        } = data;

        if (!partner_type || !company_name) {
          return res.status(400).json({ success: false, error: 'Partner type and company name are required' });
        }

        const partner = await db.insert('strategic_partners', {
          tenant_id: TENANT_ID,
          partner_type,
          company_name,
          company_domain,
          contact_name,
          contact_title,
          contact_email,
          contact_linkedin,
          contact_phone,
          tier: 'prospect',
          focus_area,
          geography,
          potential_referral_volume,
          avg_deal_size,
          referral_quality_score,
          partnership_status: 'prospecting',
          partnership_terms,
          referral_fee_structure,
          why_good_fit,
          mutual_connections: mutual_connections ? JSON.stringify(mutual_connections) : null,
          created_at: new Date(),
          updated_at: new Date()
        });

        return res.status(201).json({
          success: true,
          partner
        });
      }

      // Create activity
      if (type === 'activity') {
        const { partner_id, activity_type, activity_date, description, outcome, referral_contact_id, referral_value } = data;

        if (!partner_id || !activity_type) {
          return res.status(400).json({ success: false, error: 'Partner ID and activity type are required' });
        }

        const activity = await db.insert('partner_activities', {
          tenant_id: TENANT_ID,
          partner_id,
          activity_type,
          activity_date: activity_date ? new Date(activity_date) : new Date(),
          description,
          outcome,
          referral_contact_id,
          referral_value,
          created_at: new Date()
        });

        // Update partner's last_contact_date
        await db.query(
          'UPDATE strategic_partners SET last_contact_date = $1, updated_at = $2 WHERE id = $3 AND tenant_id = $4',
          [new Date(), new Date(), partner_id, TENANT_ID]
        );

        // If it's a referral, increment total_referrals
        if (activity_type === 'referral_received') {
          await db.query(
            'UPDATE strategic_partners SET total_referrals = total_referrals + 1, total_revenue_generated = total_revenue_generated + $1 WHERE id = $2 AND tenant_id = $3',
            [referral_value || 0, partner_id, TENANT_ID]
          );
        }

        return res.status(201).json({
          success: true,
          activity
        });
      }

      return res.status(400).json({ success: false, error: 'Invalid type. Must be "partner" or "activity"' });
    }

    // PATCH - Update partner
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Partner ID is required' });
      }

      updates.updated_at = new Date();

      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      const query = `UPDATE strategic_partners SET ${setClause} WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2} RETURNING *`;
      const result = await db.queryOne(query, [...values, id, TENANT_ID]);

      return res.status(200).json({
        success: true,
        partner: result
      });
    }

    // DELETE - Delete partner
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Partner ID is required' });
      }

      await db.query('DELETE FROM strategic_partners WHERE id = $1 AND tenant_id = $2', [id, TENANT_ID]);

      return res.status(200).json({
        success: true,
        message: 'Partner deleted successfully'
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('[Strategic Partners] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
