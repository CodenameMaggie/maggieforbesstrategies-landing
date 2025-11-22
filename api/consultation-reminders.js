const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * MFS Consultation Reminders Processor
 * Runs as CRON job to send reminders for upcoming consultations
 *
 * Schedule: Every 30 minutes (0/30 * * * *)
 */

// Meeting tables to check
const MEETING_TABLES = [
  { table: 'consultation_calls', type: 'consultation' },
  { table: 'discovery_calls', type: 'discovery' },
  { table: 'strategy_calls', type: 'strategy' }
];

/**
 * Format date and time for display
 */
function formatMeetingDateTime(scheduledTime) {
  const date = new Date(scheduledTime);

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return { dateStr, timeStr };
}

/**
 * Process 24-hour reminders
 */
async function process24HourReminders(tenantId) {
  console.log('[MFS Reminders] Processing 24-hour reminders...');

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  let totalFlagged = 0;

  for (const config of MEETING_TABLES) {
    try {
      const { data: meetings, error } = await supabase
        .from(config.table)
        .select(`
          id,
          contact_id,
          scheduled_at,
          zoom_meeting_url,
          status,
          contacts (id, full_name, email)
        `)
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', in24Hours.toISOString())
        .lte('scheduled_at', in25Hours.toISOString())
        .in('status', ['scheduled', 'confirmed']);

      if (error) {
        console.error(`[MFS Reminders] Error fetching ${config.type}:`, error);
        continue;
      }

      console.log(`[MFS Reminders] Found ${meetings?.length || 0} ${config.type} meetings in 24hr window`);

      for (const meeting of meetings || []) {
        const contact = meeting.contacts;
        if (!contact) continue;

        const { dateStr, timeStr } = formatMeetingDateTime(meeting.scheduled_at);

        // Create task for Maggie
        await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId,
            contact_id: contact.id,
            title: `24hr reminder: ${config.type} with ${contact.full_name}`,
            description: `Scheduled for ${dateStr} at ${timeStr}. Zoom: ${meeting.zoom_meeting_url || 'Check Calendly'}`,
            priority: 'high',
            status: 'pending',
            source: 'cron_reminder',
            due_date_text: 'Tomorrow',
            created_at: new Date().toISOString()
          });

        // Log activity
        await supabase
          .from('contact_activities')
          .insert({
            tenant_id: tenantId,
            contact_id: contact.id,
            type: 'reminder_24hr',
            description: `24-hour reminder for ${config.type} - ${dateStr} at ${timeStr}`,
            metadata: {
              meeting_type: config.type,
              scheduled_at: meeting.scheduled_at
            },
            created_at: new Date().toISOString()
          });

        totalFlagged++;
        console.log(`[MFS Reminders] Flagged: ${config.type} with ${contact.full_name}`);
      }

    } catch (tableError) {
      console.error(`[MFS Reminders] Error processing ${config.table}:`, tableError);
    }
  }

  return totalFlagged;
}

/**
 * Process 1-hour reminders
 */
async function process1HourReminders(tenantId) {
  console.log('[MFS Reminders] Processing 1-hour reminders...');

  const now = new Date();
  const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
  const in90Min = new Date(now.getTime() + 90 * 60 * 1000);

  let totalFlagged = 0;

  for (const config of MEETING_TABLES) {
    try {
      const { data: meetings, error } = await supabase
        .from(config.table)
        .select(`
          id,
          contact_id,
          scheduled_at,
          zoom_meeting_url,
          status,
          contacts (id, full_name, email)
        `)
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', in1Hour.toISOString())
        .lte('scheduled_at', in90Min.toISOString())
        .in('status', ['scheduled', 'confirmed']);

      if (error) continue;

      for (const meeting of meetings || []) {
        const contact = meeting.contacts;
        if (!contact) continue;

        const { timeStr } = formatMeetingDateTime(meeting.scheduled_at);

        // Create urgent task
        await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId,
            contact_id: contact.id,
            title: `STARTING SOON: ${config.type} with ${contact.full_name}`,
            description: `Starting at ${timeStr}. Zoom: ${meeting.zoom_meeting_url || 'Check Calendly'}`,
            priority: 'high',
            status: 'pending',
            source: 'cron_reminder',
            due_date_text: 'Now',
            created_at: new Date().toISOString()
          });

        totalFlagged++;
      }

    } catch (tableError) {
      console.error(`[MFS Reminders] Error:`, tableError);
    }
  }

  return totalFlagged;
}

/**
 * Detect no-shows (meetings that passed without completion)
 */
async function detectNoShows(tenantId) {
  console.log('[MFS Reminders] Detecting no-shows...');

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  let totalNoShows = 0;

  for (const config of MEETING_TABLES) {
    try {
      const { data: meetings, error } = await supabase
        .from(config.table)
        .select(`
          id,
          contact_id,
          scheduled_at,
          contacts (id, full_name, email)
        `)
        .eq('tenant_id', tenantId)
        .lt('scheduled_at', twoHoursAgo.toISOString())
        .in('status', ['scheduled', 'confirmed']);

      if (error) continue;

      for (const meeting of meetings || []) {
        const contact = meeting.contacts;

        // Mark as no-show
        await supabase
          .from(config.table)
          .update({
            status: 'no_show',
            updated_at: new Date().toISOString()
          })
          .eq('id', meeting.id);

        // Update contact
        if (contact) {
          await supabase
            .from('contacts')
            .update({
              booking_response_status: 'no_show',
              updated_at: new Date().toISOString()
            })
            .eq('id', contact.id);

          // Log activity
          await supabase
            .from('contact_activities')
            .insert({
              tenant_id: tenantId,
              contact_id: contact.id,
              type: 'no_show',
              description: `No-show for ${config.type} scheduled at ${meeting.scheduled_at}`,
              created_at: new Date().toISOString()
            });
        }

        totalNoShows++;
        console.log(`[MFS Reminders] Marked no-show: ${config.type} ${meeting.id}`);
      }

    } catch (tableError) {
      console.error(`[MFS Reminders] Error:`, tableError);
    }
  }

  return totalNoShows;
}

/**
 * Main handler
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

  try {
    console.log('[MFS Reminders] Starting...');

    const tenantId = process.env.MFS_TENANT_ID;

    const reminders24hr = await process24HourReminders(tenantId);
    const reminders1hr = await process1HourReminders(tenantId);
    const noShows = await detectNoShows(tenantId);

    console.log(`[MFS Reminders] Complete: ${reminders24hr} 24hr, ${reminders1hr} 1hr, ${noShows} no-shows`);

    return res.status(200).json({
      success: true,
      message: 'Consultation reminders processed',
      stats: {
        reminders_24hr: reminders24hr,
        reminders_1hr: reminders1hr,
        no_shows_detected: noShows
      }
    });

  } catch (error) {
    console.error('[MFS Reminders] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process reminders',
      details: error.message
    });
  }
};
