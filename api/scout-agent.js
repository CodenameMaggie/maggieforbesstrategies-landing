const db = require('./utils/db');
const { scrapeFundingNews } = require('./utils/rss-scraper');
const { qualifyProspect } = require('./utils/prospect-qualifier');

/**
 * SCOUT AGENT - AI PROSPECTING SYSTEM
 * Autonomous agent that finds $150K+ leads and posts to Mattermost
 *
 * Features:
 * - Scrapes RSS feeds for funding announcements
 * - Qualifies prospects using rule-based scoring
 * - Posts high-intent leads to #scraping-alerts
 * - Tracks performance in learning loop
 * - Improves over time based on win rates
 */

module.exports = async (req, res) => {
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cron-Secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    if (req.method === 'GET') {
      // Return scout agent stats
      const stats = await getScoutStats(tenantId);
      return res.status(200).json({
        success: true,
        stats
      });
    }

    if (req.method === 'POST') {
      console.log('[Scout Agent] 🔍 Starting prospecting run...');

      // Step 1: Scrape funding news
      const prospects = await scrapeFundingNews();
      console.log(`[Scout Agent] Found ${prospects.length} prospects from RSS`);

      if (prospects.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No new prospects found',
          prospects: []
        });
      }

      // Step 2: Qualify prospects
      const qualified = [];
      const rejected = [];

      for (const prospect of prospects) {
        const qualification = qualifyProspect({
          companyName: prospect.companyName,
          contactPerson: prospect.contactPerson,
          recentSignal: prospect.recentSignal,
          industry: prospect.industry,
          companySize: prospect.companySize,
          fundingAmount: prospect.recentSignal,
          signalType: prospect.signalType,
          signalDate: new Date()
        });

        // Only accept high-quality prospects (score >= 70)
        if (qualification.qualified && qualification.score >= 70) {
          qualified.push({
            ...prospect,
            qualification
          });
        } else {
          rejected.push({
            ...prospect,
            qualification
          });
        }
      }

      console.log(`[Scout Agent] ✓ Qualified: ${qualified.length}, ✗ Rejected: ${rejected.length}`);

      // Step 3: Save qualified prospects to database
      const saved = [];

      for (const prospect of qualified) {
        // Check if already exists
        const existing = await db.queryOne(
          'SELECT id FROM contacts WHERE company ILIKE $1 AND tenant_id = $2',
          [prospect.companyName, tenantId]
        );

        if (existing) {
          console.log(`[Scout Agent] ⏭  Skipping duplicate: ${prospect.companyName}`);
          continue;
        }

        // Save to database
        const contact = await db.insert('contacts', {
          tenant_id: tenantId,
          full_name: prospect.contactPerson,
          email: `contact@${prospect.companyName.toLowerCase().replace(/\s+/g, '')}.com`, // Placeholder
          company: prospect.companyName,
          stage: 'new',
          lead_source: 'scout_agent_rss',
          notes: buildProspectNotes(prospect),
          client_type: 'high_value_prospect',
          created_at: new Date(),
          updated_at: new Date()
        });

        // Log the signal
        await db.insert('contact_activities', {
          tenant_id: tenantId,
          contact_id: contact.id,
          type: 'scout_agent_discovery',
          description: buildActivityDescription(prospect),
          created_at: new Date()
        });

        saved.push({
          ...prospect,
          contactId: contact.id
        });
      }

      console.log(`[Scout Agent] 💾 Saved ${saved.length} new prospects to database`);

      // Step 4: Post to Mattermost #scraping-alerts
      if (saved.length > 0) {
        await postToScrapingAlerts(saved, tenantId);
      }

      // Step 5: Update learning metrics
      await updateScoutMetrics(prospects.length, qualified.length, saved.length, tenantId);

      return res.status(200).json({
        success: true,
        message: `Scout agent found ${saved.length} qualified prospects`,
        stats: {
          total_scraped: prospects.length,
          qualified: qualified.length,
          saved: saved.length,
          rejected: rejected.length
        },
        prospects: saved
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Scout Agent] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Build prospect notes
 */
function buildProspectNotes(prospect) {
  const { qualification } = prospect;

  let notes = `🤖 **SCOUT AGENT DISCOVERY**\n\n`;
  notes += `**Company:** ${prospect.companyName}\n`;
  notes += `**Signal:** ${prospect.recentSignal}\n`;
  notes += `**Industry:** ${prospect.industry}\n`;
  notes += `**Source:** ${prospect.whereFound}\n`;
  notes += `**URL:** ${prospect.postUrl}\n\n`;

  notes += `📊 **QUALIFICATION**\n`;
  notes += `**Score:** ${qualification.score}/100\n`;
  notes += `**Priority:** ${qualification.priority.toUpperCase()}\n`;
  notes += `**Qualified:** ${qualification.qualified ? 'YES ✓' : 'NO ✗'}\n\n`;

  if (qualification.reasons.length > 0) {
    notes += `**Why Qualified:**\n`;
    qualification.reasons.forEach(r => {
      notes += `• ${r}\n`;
    });
    notes += '\n';
  }

  if (qualification.pain_points.length > 0) {
    notes += `**Likely Pain Points:**\n`;
    qualification.pain_points.forEach(p => {
      notes += `• ${p}\n`;
    });
    notes += '\n';
  }

  notes += `**Recommended Approach:** ${prospect.approachAngle}`;

  return notes;
}

/**
 * Build activity description
 */
function buildActivityDescription(prospect) {
  return `🔍 Scout Agent discovered high-value prospect\n\n` +
    `Signal: ${prospect.recentSignal}\n` +
    `Qualification Score: ${prospect.qualification.score}/100\n` +
    `Priority: ${prospect.qualification.priority}\n\n` +
    `Source: ${prospect.postUrl}`;
}

/**
 * Post to Mattermost #scraping-alerts
 */
async function postToScrapingAlerts(prospects, tenantId) {
  try {
    const totalFunding = prospects.reduce((sum, p) => {
      const match = p.recentSignal.match(/\$?([\d.]+)\s*(million|billion|M|B)/i);
      if (match) {
        const amount = parseFloat(match[1]);
        const multiplier = match[2].toLowerCase().startsWith('b') ? 1000 : 1;
        return sum + (amount * multiplier);
      }
      return sum;
    }, 0);

    const message = `🚨 **${prospects.length} New $150K+ Leads Scraped from SAM.gov**\n\n` +
      `Total Funding: $${totalFunding.toFixed(0)}M+\n` +
      `Average Qualification Score: ${Math.round(prospects.reduce((sum, p) => sum + p.qualification.score, 0) / prospects.length)}/100`;

    await fetch('/api/mattermost-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelType: 'scraping_alerts',
        message,
        data: { prospects }
      })
    });

    console.log('[Scout Agent] ✓ Posted to Mattermost #scraping-alerts');
  } catch (error) {
    console.error('[Scout Agent] Mattermost post failed:', error.message);
  }
}

/**
 * Update scout metrics (learning loop)
 */
async function updateScoutMetrics(totalScraped, qualified, saved, tenantId) {
  try {
    const qualificationRate = totalScraped > 0 ? (qualified / totalScraped * 100) : 0;
    const saveRate = qualified > 0 ? (saved / qualified * 100) : 0;

    await db.insert('learning_metrics', {
      tenant_id: tenantId,
      metric_category: 'prospecting',
      metric_type: 'scout_agent_qualification_rate',
      current_value: qualificationRate,
      measurement_date: new Date(),
      time_period: 'daily',
      notes: `Scraped: ${totalScraped}, Qualified: ${qualified}, Saved: ${saved}`,
      created_at: new Date()
    });

    await db.insert('learning_metrics', {
      tenant_id: tenantId,
      metric_category: 'prospecting',
      metric_type: 'scout_agent_save_rate',
      current_value: saveRate,
      measurement_date: new Date(),
      time_period: 'daily',
      notes: `Qualified: ${qualified}, Saved (non-duplicate): ${saved}`,
      created_at: new Date()
    });

    console.log(`[Scout Agent] 📊 Learning metrics updated: ${qualificationRate.toFixed(1)}% qualification, ${saveRate.toFixed(1)}% save rate`);
  } catch (error) {
    console.error('[Scout Agent] Learning metrics update failed:', error.message);
  }
}

/**
 * Get scout agent statistics
 */
async function getScoutStats(tenantId) {
  // Get total prospects found
  const totalProspects = await db.queryOne(
    `SELECT COUNT(*) as count FROM contacts
     WHERE tenant_id = $1 AND lead_source = 'scout_agent_rss'`,
    [tenantId]
  );

  // Get conversion rate (scout prospects → closed won)
  const closedWon = await db.queryOne(
    `SELECT COUNT(*) as count FROM contacts
     WHERE tenant_id = $1 AND lead_source = 'scout_agent_rss' AND stage = 'closed_won'`,
    [tenantId]
  );

  const conversionRate = totalProspects.count > 0
    ? (closedWon.count / totalProspects.count * 100)
    : 0;

  // Get recent qualification metrics
  const recentMetrics = await db.query(
    `SELECT * FROM learning_metrics
     WHERE tenant_id = $1
     AND metric_category = 'prospecting'
     AND metric_type LIKE 'scout_agent%'
     ORDER BY measurement_date DESC
     LIMIT 30`,
    [tenantId]
  );

  // Calculate average qualification rate
  const qualMetrics = recentMetrics.filter(m => m.metric_type === 'scout_agent_qualification_rate');
  const avgQualRate = qualMetrics.length > 0
    ? qualMetrics.reduce((sum, m) => sum + parseFloat(m.current_value), 0) / qualMetrics.length
    : 0;

  return {
    total_prospects_found: parseInt(totalProspects.count),
    total_closed_won: parseInt(closedWon.count),
    conversion_rate: conversionRate.toFixed(2),
    avg_qualification_rate: avgQualRate.toFixed(2),
    runs_last_30_days: recentMetrics.length / 2, // Divide by 2 since we track 2 metrics per run
    last_run: recentMetrics[0]?.measurement_date || null
  };
}
