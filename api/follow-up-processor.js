const db = require('./utils/db');

/**
 * MFS Follow-up Processor
 * Runs as CRON job to identify contacts needing follow-up
 *
 * Schedule: Every 6 hours (0 */6 * * *)
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('[MFS Follow-up] Starting...');

  try {
    const tenantId = process.env.MFS_TENANT_ID;
    const results = {
      stale_contacts: 0,
      needs_followup: [],
      errors: []
    };

    // ============================================
    // Find contacts not contacted in 7+ days
    // ============================================
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const staleContacts = await db.queryAll(`
      SELECT id, full_name, email, stage, updated_at
      FROM contacts
      WHERE tenant_id = $1
      AND updated_at < $2
      AND stage IN ('new', 'consultation_scheduled', 'discovery', 'strategy')
      ORDER BY updated_at ASC
      LIMIT 20
    `, [tenantId, sevenDaysAgo]);

    if (staleContacts && staleContacts.length > 0) {
      console.log(`[MFS Follow-up] Found ${staleContacts.length} stale contacts`);

      for (const contact of staleContacts) {
        const daysSinceContact = Math.floor(
          (Date.now() - new Date(contact.updated_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        results.needs_followup.push({
          id: contact.id,
          name: contact.full_name,
          email: contact.email,
          stage: contact.stage,
          days_since_contact: daysSinceContact
        });

        // Log activity
        await db.insert('contact_activities', {
          tenant_id: tenantId,
          contact_id: contact.id,
          type: 'followup_flagged',
          description: `Flagged for follow-up - ${daysSinceContact} days since last contact`,
          created_at: new Date()
        });

        results.stale_contacts++;
      }
    }

    // ============================================
    // Find contacts with no-response status
    // ============================================
    const noResponseContacts = await db.queryAll(`
      SELECT id, full_name, email, stage, booking_response_status
      FROM contacts
      WHERE tenant_id = $1
      AND booking_response_status = 'no_response'
      LIMIT 10
    `, [tenantId]);

    if (noResponseContacts) {
      for (const contact of noResponseContacts) {
        if (!results.needs_followup.find(c => c.id === contact.id)) {
          results.needs_followup.push({
            id: contact.id,
            name: contact.full_name,
            email: contact.email,
            stage: contact.stage,
            reason: 'no_response_to_booking'
          });
        }
      }
    }

    // ============================================
    // Create summary task if there are follow-ups needed
    // ============================================
    if (results.needs_followup.length > 0) {
      await db.insert('tasks', {
        tenant_id: tenantId,
        title: `${results.needs_followup.length} contacts need follow-up`,
        description: `Contacts flagged: ${results.needs_followup.map(c => c.name || c.email).join(', ')}`,
        priority: 'high',
        status: 'pending',
        source: 'cron_followup',
        due_date_text: 'Today',
        created_at: new Date()
      });
    }

    console.log('[MFS Follow-up] Complete');
    console.log('[MFS Follow-up] Results:', results);

    return res.status(200).json({
      success: true,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[MFS Follow-up] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: 'Follow-up processor failed',
      details: error.message
    });
  }
};
