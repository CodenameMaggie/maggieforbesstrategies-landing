const db = require('./utils/db');
const emailService = require('./utils/email-service');

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
      const meetings = await db.queryAll(`
        SELECT m.id, m.contact_id, m.scheduled_at, m.meeting_link as zoom_meeting_url, m.status,
               c.id as contact_id, c.full_name as contact_name, c.email as contact_email
        FROM ${config.table} m
        LEFT JOIN contacts c ON m.contact_id = c.id
        WHERE m.tenant_id = $1
        AND m.scheduled_at >= $2
        AND m.scheduled_at <= $3
        AND m.status IN ('scheduled', 'confirmed')
      `, [tenantId, in24Hours.toISOString(), in25Hours.toISOString()]);

      console.log(`[MFS Reminders] Found ${meetings.length} ${config.type} meetings in 24hr window`);

      for (const meeting of meetings) {
        if (!meeting.contact_email) continue;

        const { dateStr, timeStr} = formatMeetingDateTime(meeting.scheduled_at);

        // Send email reminder
        await emailService.sendConsultationReminder({
          type: config.type,
          scheduled_at: meeting.scheduled_at,
          contact_name: meeting.contact_name,
          contact_email: meeting.contact_email,
          meeting_link: meeting.zoom_meeting_url
        });

        // Create task for Maggie
        await db.insert('tasks', {
          tenant_id: tenantId,
          contact_id: meeting.contact_id,
          title: `24hr reminder: ${config.type} with ${meeting.contact_name}`,
          description: `Scheduled for ${dateStr} at ${timeStr}. Zoom: ${meeting.zoom_meeting_url || 'Check Calendly'}`,
          priority: 'high',
          status: 'pending',
          source: 'cron_reminder',
          due_date_text: 'Tomorrow',
          created_at: new Date()
        });

        // Log activity
        await db.insert('contact_activities', {
          tenant_id: tenantId,
          contact_id: meeting.contact_id,
          type: 'reminder_24hr',
          description: `24-hour reminder for ${config.type} - ${dateStr} at ${timeStr}`,
          created_at: new Date()
        });

        totalFlagged++;
        console.log(`[MFS Reminders] Flagged: ${config.type} with ${meeting.contact_name}`);
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
      const meetings = await db.queryAll(`
        SELECT m.id, m.contact_id, m.scheduled_at, m.meeting_link as zoom_meeting_url, m.status,
               c.id as contact_id, c.full_name as contact_name, c.email as contact_email
        FROM ${config.table} m
        LEFT JOIN contacts c ON m.contact_id = c.id
        WHERE m.tenant_id = $1
        AND m.scheduled_at >= $2
        AND m.scheduled_at <= $3
        AND m.status IN ('scheduled', 'confirmed')
      `, [tenantId, in1Hour.toISOString(), in90Min.toISOString()]);

      for (const meeting of meetings) {
        if (!meeting.contact_email) continue;

        const { timeStr } = formatMeetingDateTime(meeting.scheduled_at);

        // Create urgent task
        await db.insert('tasks', {
          tenant_id: tenantId,
          contact_id: meeting.contact_id,
          title: `STARTING SOON: ${config.type} with ${meeting.contact_name}`,
          description: `Starting at ${timeStr}. Zoom: ${meeting.zoom_meeting_url || 'Check Calendly'}`,
          priority: 'high',
          status: 'pending',
          source: 'cron_reminder',
          due_date_text: 'Now',
          created_at: new Date()
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
      const meetings = await db.queryAll(`
        SELECT m.id, m.contact_id, m.scheduled_at,
               c.id as contact_id, c.full_name as contact_name, c.email as contact_email
        FROM ${config.table} m
        LEFT JOIN contacts c ON m.contact_id = c.id
        WHERE m.tenant_id = $1
        AND m.scheduled_at < $2
        AND m.status IN ('scheduled', 'confirmed')
      `, [tenantId, twoHoursAgo.toISOString()]);

      for (const meeting of meetings) {
        // Mark as no-show
        await db.query(`
          UPDATE ${config.table}
          SET status = 'no_show', updated_at = $1
          WHERE id = $2
        `, [new Date(), meeting.id]);

        // Update contact
        if (meeting.contact_id) {
          await db.query(`
            UPDATE contacts
            SET booking_response_status = 'no_show', updated_at = $1
            WHERE id = $2
          `, [new Date(), meeting.contact_id]);

          // Log activity
          await db.insert('contact_activities', {
            tenant_id: tenantId,
            contact_id: meeting.contact_id,
            type: 'no_show',
            description: `No-show for ${config.type} scheduled at ${meeting.scheduled_at}`,
            created_at: new Date()
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // CRON_SECRET protection - prevent unauthorized email sending
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['x-cron-secret'] || req.headers['authorization'];
    if (authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[MFS Reminders] Unauthorized access attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }
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
