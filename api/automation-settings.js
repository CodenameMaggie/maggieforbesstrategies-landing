const db = require('./utils/db');

/**
 * AUTOMATION SETTINGS API
 * Manages automation configuration and provides stats
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    if (req.method === 'GET') {
      // Get current settings and stats
      const settings = await getSettings(tenantId);
      const stats = await getAutomationStats(tenantId);

      return res.status(200).json({
        success: true,
        settings,
        stats
      });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      // Update settings
      const { settings } = req.body;

      await db.query(
        `INSERT INTO ai_memory_store (tenant_id, category, key, value, last_updated)
         VALUES ($1, 'automation', 'settings', $2, $3)
         ON CONFLICT (tenant_id, category, key)
         DO UPDATE SET value = $2, last_updated = $3`,
        [tenantId, JSON.stringify(settings), new Date()]
      );

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully'
      });
    }

  } catch (error) {
    console.error('[Automation Settings] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

async function getSettings(tenantId) {
  const result = await db.queryOne(
    `SELECT value FROM ai_memory_store WHERE tenant_id = $1 AND category = 'automation' AND key = 'settings'`,
    [tenantId]
  );

  if (result?.value) {
    try {
      return JSON.parse(result.value);
    } catch (e) {
      console.error('Error parsing settings:', e);
    }
  }

  // Default settings
  return {
    salesAutomationEnabled: true,
    linkedInProspectingEnabled: true,
    webProspectingEnabled: true,
    linkedInSchedule: 'daily',
    webSchedule: 'daily',
    salesSchedule: 'continuous'
  };
}

async function getAutomationStats(tenantId) {
  // Get stats from various sources
  const contactStats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE lead_source LIKE 'linkedin%') as linkedin_prospects,
      COUNT(*) FILTER (WHERE lead_source LIKE 'web%' OR lead_source = 'business_news' OR lead_source = 'job_posting_signal') as web_prospects,
      COUNT(*) FILTER (WHERE stage = 'qualified' AND created_at > NOW() - INTERVAL '7 days') as recent_qualified,
      COUNT(*) FILTER (WHERE stage = 'closed_won' AND created_at > NOW() - INTERVAL '30 days') as monthly_closed
    FROM contacts
    WHERE tenant_id = $1
  `, [tenantId]);

  const taskStats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE source = 'sales_automation') as automation_tasks,
      COUNT(*) FILTER (WHERE source = 'sales_automation' AND status = 'completed') as completed_automation_tasks
    FROM tasks
    WHERE tenant_id = $1
  `, [tenantId]);

  const activityStats = await db.queryOne(`
    SELECT
      COUNT(*) FILTER (WHERE type = 'automated_follow_up') as follow_ups_sent,
      COUNT(*) FILTER (WHERE type = 'automated_qualification') as leads_qualified,
      COUNT(*) FILTER (WHERE type = 'stage_progression') as stages_progressed,
      COUNT(*) FILTER (WHERE type = 'automation_run' AND created_at > NOW() - INTERVAL '24 hours') as runs_today
    FROM contact_activities
    WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '7 days'
  `, [tenantId]);

  return {
    prospects: {
      linkedIn: parseInt(contactStats?.linkedin_prospects || 0),
      web: parseInt(contactStats?.web_prospects || 0),
      total: parseInt(contactStats?.linkedin_prospects || 0) + parseInt(contactStats?.web_prospects || 0)
    },
    automation: {
      leadsQualified: parseInt(activityStats?.leads_qualified || 0),
      followUpsSent: parseInt(activityStats?.follow_ups_sent || 0),
      stagesProgressed: parseInt(activityStats?.stages_progressed || 0),
      tasksCreated: parseInt(taskStats?.automation_tasks || 0),
      tasksCompleted: parseInt(taskStats?.completed_automation_tasks || 0)
    },
    recent: {
      qualifiedThisWeek: parseInt(contactStats?.recent_qualified || 0),
      closedThisMonth: parseInt(contactStats?.monthly_closed || 0),
      automationRunsToday: parseInt(activityStats?.runs_today || 0)
    }
  };
}
