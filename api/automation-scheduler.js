const db = require('./utils/db');

/**
 * AUTOMATION SCHEDULER
 * Runs all automated sales and prospecting tasks on a schedule
 * Called by external cron (Railway Cron, Vercel Cron, or manual trigger)
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cron-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify CRON secret for security (only required for external calls)
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers['x-cron-secret'] || req.query.secret || req.body?.secret;
  const isInternalCall = req.headers.origin && allowedOrigins.includes(req.headers.origin);

  // Require secret only for external calls (not from dashboard)
  if (cronSecret && !isInternalCall && providedSecret !== cronSecret) {
    console.error('[Automation Scheduler] Invalid or missing CRON_SECRET');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid CRON_SECRET'
    });
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    console.log('[Automation Scheduler] Starting scheduled automation run...');

    const results = {
      timestamp: new Date().toISOString(),
      salesAutomation: null,
      linkedInProspecting: null,
      webProspecting: null,
      errors: []
    };

    // Get automation settings
    const settings = await getAutomationSettings(tenantId);

    // 1. Run Sales Automation (if enabled)
    if (settings.salesAutomationEnabled) {
      try {
        console.log('[Automation Scheduler] Running sales automation...');
        const salesModule = require('./sales-automation');
        const mockReq = { method: 'POST', headers: {}, body: {} };
        const mockRes = {
          status: (code) => mockRes,
          json: (data) => { results.salesAutomation = data; return mockRes; },
          setHeader: () => mockRes,
          end: () => mockRes
        };
        await salesModule(mockReq, mockRes);
      } catch (error) {
        console.error('[Automation Scheduler] Sales automation error:', error);
        results.errors.push({ task: 'sales_automation', error: error.message });
      }
    }

    // 2. LinkedIn Prospecting - DISABLED (violates LinkedIn ToS)
    // Focusing on legitimate public business news sources instead
    console.log('[Automation Scheduler] LinkedIn prospecting disabled - using web prospecting only');

    // 3. Run Web Prospecting (if enabled and scheduled for today)
    if (settings.webProspectingEnabled && shouldRunToday(settings.webSchedule)) {
      try {
        console.log('[Automation Scheduler] Running web prospecting...');
        const webModule = require('./web-prospector');
        const mockReq = {
          method: 'POST',
          headers: {},
          body: { action: 'scan_web', data: {} }
        };
        const mockRes = {
          status: (code) => mockRes,
          json: (data) => { results.webProspecting = data; return mockRes; },
          setHeader: () => mockRes,
          end: () => mockRes
        };
        await webModule(mockReq, mockRes);
      } catch (error) {
        console.error('[Automation Scheduler] Web prospecting error:', error);
        results.errors.push({ task: 'web_prospecting', error: error.message });
      }
    }

    // Log automation run
    await logAutomationRun(tenantId, results);

    console.log('[Automation Scheduler] Automation run complete:', results);

    return res.status(200).json({
      success: true,
      results,
      message: 'Automation completed successfully'
    });

  } catch (error) {
    console.error('[Automation Scheduler] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get automation settings for tenant
 */
async function getAutomationSettings(tenantId) {
  const settings = await db.queryOne(
    `SELECT value FROM ai_memory_store WHERE tenant_id = $1 AND category = 'automation' AND key = 'settings'`,
    [tenantId]
  );

  if (settings?.value) {
    try {
      return JSON.parse(settings.value);
    } catch (e) {
      console.error('[Automation Scheduler] Error parsing settings:', e);
    }
  }

  // Default settings
  return {
    salesAutomationEnabled: true,
    linkedInProspectingEnabled: true,
    webProspectingEnabled: true,
    linkedInSchedule: 'daily', // daily, weekly, manual
    webSchedule: 'daily',
    salesSchedule: 'continuous' // runs every time
  };
}

/**
 * Check if task should run today based on schedule
 */
function shouldRunToday(schedule) {
  if (schedule === 'manual') return false;
  if (schedule === 'daily') return true;

  if (schedule === 'weekly') {
    // Run on Mondays
    const today = new Date().getDay();
    return today === 1;
  }

  return true;
}

/**
 * Log automation run to database
 */
async function logAutomationRun(tenantId, results) {
  try {
    await db.insert('contact_activities', {
      tenant_id: tenantId,
      contact_id: null,
      type: 'automation_run',
      description: JSON.stringify({
        timestamp: results.timestamp,
        salesAutomation: !!results.salesAutomation,
        linkedInProspecting: !!results.linkedInProspecting,
        webProspecting: !!results.webProspecting,
        errorCount: results.errors.length
      }),
      created_at: new Date()
    });
  } catch (error) {
    console.error('[Automation Scheduler] Error logging run:', error);
  }
}
