const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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

    const { data: staleContacts, error: staleError } = await supabase
      .from('contacts')
      .select('id, full_name, email, stage, updated_at')
      .eq('tenant_id', tenantId)
      .lt('updated_at', sevenDaysAgo)
      .in('stage', ['new', 'consultation_scheduled', 'discovery', 'strategy'])
      .order('updated_at', { ascending: true })
      .limit(20);

    if (staleError) {
      console.error('[MFS Follow-up] Error fetching stale contacts:', staleError);
      results.errors.push({ type: 'stale_fetch', error: staleError.message });
    } else if (staleContacts && staleContacts.length > 0) {
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
        await supabase
          .from('contact_activities')
          .insert({
            tenant_id: tenantId,
            contact_id: contact.id,
            type: 'followup_flagged',
            description: `Flagged for follow-up - ${daysSinceContact} days since last contact`,
            metadata: {
              days_stale: daysSinceContact,
              stage: contact.stage,
              flagged_by: 'cron_processor'
            },
            created_at: new Date().toISOString()
          });

        results.stale_contacts++;
      }
    }

    // ============================================
    // Find contacts with no-response status
    // ============================================
    const { data: noResponseContacts, error: noResponseError } = await supabase
      .from('contacts')
      .select('id, full_name, email, stage, booking_response_status')
      .eq('tenant_id', tenantId)
      .eq('booking_response_status', 'no_response')
      .limit(10);

    if (!noResponseError && noResponseContacts) {
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
      await supabase
        .from('tasks')
        .insert({
          tenant_id: tenantId,
          title: `${results.needs_followup.length} contacts need follow-up`,
          description: `Contacts flagged: ${results.needs_followup.map(c => c.name || c.email).join(', ')}`,
          priority: 'high',
          status: 'pending',
          source: 'cron_followup',
          due_date_text: 'Today',
          created_at: new Date().toISOString()
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
