const db = require('./utils/db');

/**
 * LEARNING LOOP - AI THAT IMPROVES OVER TIME
 * Tracks win rates, conversion metrics, and what works
 * Posts insights to #learning-loop Mattermost channel
 *
 * Tracks:
 * - Scout agent performance (qualification → closed won)
 * - Sales conversion rates (stage progression)
 * - Client delivery metrics (on-time delivery, satisfaction)
 * - Revenue metrics (MRR growth, churn rate)
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    if (req.method === 'GET') {
      const { category, period } = req.query;

      // Get learning metrics with filters
      let query = 'SELECT * FROM learning_metrics WHERE tenant_id = $1';
      const params = [tenantId];

      if (category) {
        params.push(category);
        query += ` AND metric_category = $${params.length}`;
      }

      if (period) {
        params.push(period);
        query += ` AND time_period = $${params.length}`;
      }

      query += ' ORDER BY measurement_date DESC LIMIT 100';

      const metrics = await db.query(query, params);

      // Calculate insights
      const insights = await calculateInsights(metrics, tenantId);

      return res.status(200).json({
        success: true,
        metrics,
        insights
      });
    }

    if (req.method === 'POST') {
      const { action, data } = req.body;

      switch (action) {
        case 'record_metric':
          return await recordMetric(data, tenantId, res);

        case 'calculate_win_rate':
          return await calculateWinRate(tenantId, res);

        case 'analyze_patterns':
          return await analyzePatterns(tenantId, res);

        case 'post_insights':
          return await postInsightsToMattermost(tenantId, res);

        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Learning Loop] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Record a new metric
 */
async function recordMetric(data, tenantId, res) {
  const {
    contactId, metricCategory, metricType,
    baselineValue, currentValue, targetValue,
    timePeriod, notes
  } = data;

  if (!metricCategory || !metricType || currentValue === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: metricCategory, metricType, currentValue'
    });
  }

  // Calculate improvement percentage
  let improvementPct = null;
  if (baselineValue && currentValue) {
    improvementPct = ((currentValue - baselineValue) / baselineValue) * 100;
  }

  const metric = await db.insert('learning_metrics', {
    tenant_id: tenantId,
    contact_id: contactId,
    metric_category: metricCategory,
    metric_type: metricType,
    baseline_value: baselineValue,
    current_value: currentValue,
    target_value: targetValue,
    measurement_date: new Date(),
    time_period: timePeriod || 'daily',
    improvement_pct: improvementPct,
    notes,
    created_at: new Date()
  });

  return res.status(200).json({
    success: true,
    metric
  });
}

/**
 * Calculate win rate
 */
async function calculateWinRate(tenantId, res) {
  // Overall win rate
  const total = await db.queryOne(
    `SELECT COUNT(*) as count FROM contacts
     WHERE tenant_id = $1 AND stage NOT IN ('new', 'qualified')`,
    [tenantId]
  );

  const won = await db.queryOne(
    `SELECT COUNT(*) as count FROM contacts
     WHERE tenant_id = $1 AND stage = 'closed_won'`,
    [tenantId]
  );

  const winRate = total.count > 0 ? (won.count / total.count * 100) : 0;

  // Win rate by source
  const bySource = await db.query(
    `SELECT
       lead_source,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE stage = 'closed_won') as won,
       ROUND(COUNT(*) FILTER (WHERE stage = 'closed_won')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as win_rate
     FROM contacts
     WHERE tenant_id = $1 AND stage NOT IN ('new', 'qualified')
     GROUP BY lead_source
     ORDER BY win_rate DESC`,
    [tenantId]
  );

  // Win rate by tier
  const byTier = await db.query(
    `SELECT
       client_tier,
       COUNT(*) as total,
       ROUND(AVG(mrr), 2) as avg_mrr
     FROM contacts
     WHERE tenant_id = $1 AND stage = 'closed_won'
     GROUP BY client_tier
     ORDER BY avg_mrr DESC`,
    [tenantId]
  );

  // Record overall win rate metric
  await db.insert('learning_metrics', {
    tenant_id: tenantId,
    metric_category: 'sales',
    metric_type: 'overall_win_rate',
    current_value: winRate,
    measurement_date: new Date(),
    time_period: 'monthly',
    notes: `Total: ${total.count}, Won: ${won.count}`,
    created_at: new Date()
  });

  return res.status(200).json({
    success: true,
    overall_win_rate: winRate.toFixed(2),
    total_opportunities: parseInt(total.count),
    total_won: parseInt(won.count),
    by_source: bySource,
    by_tier: byTier
  });
}

/**
 * Analyze patterns to find what works
 */
async function analyzePatterns(tenantId, res) {
  console.log('[Learning Loop] 📊 Analyzing patterns...');

  // Pattern 1: Which lead sources convert best?
  const bestSources = await db.query(
    `SELECT
       lead_source,
       COUNT(*) as total_leads,
       COUNT(*) FILTER (WHERE stage = 'closed_won') as won,
       ROUND(COUNT(*) FILTER (WHERE stage = 'closed_won')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as conversion_rate,
       ROUND(AVG(mrr) FILTER (WHERE stage = 'closed_won'), 2) as avg_deal_value
     FROM contacts
     WHERE tenant_id = $1
     GROUP BY lead_source
     HAVING COUNT(*) >= 3
     ORDER BY conversion_rate DESC, avg_deal_value DESC
     LIMIT 5`,
    [tenantId]
  );

  // Pattern 2: Average time to close by source
  const timeToClose = await db.query(
    `SELECT
       lead_source,
       ROUND(AVG(EXTRACT(EPOCH FROM (client_since - created_at)) / 86400), 1) as avg_days_to_close
     FROM contacts
     WHERE tenant_id = $1 AND stage = 'closed_won' AND client_since IS NOT NULL
     GROUP BY lead_source
     ORDER BY avg_days_to_close ASC`,
    [tenantId]
  );

  // Pattern 3: Deliverable completion rates
  const deliveryPerformance = await db.query(
    `SELECT
       deliverable_type,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
       ROUND(COUNT(*) FILTER (WHERE status = 'delivered')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as delivery_rate,
       ROUND(AVG(actual_hours), 2) as avg_hours
     FROM client_deliverables
     WHERE tenant_id = $1
     GROUP BY deliverable_type
     ORDER BY delivery_rate DESC`,
    [tenantId]
  );

  // Pattern 4: Revenue by tier
  const revenueByTier = await db.query(
    `SELECT
       client_tier,
       COUNT(*) as clients,
       ROUND(SUM(mrr), 2) as total_mrr,
       ROUND(AVG(mrr), 2) as avg_mrr,
       ROUND(SUM(mrr) * 12, 2) as annual_value
     FROM contacts
     WHERE tenant_id = $1 AND client_status = 'active'
     GROUP BY client_tier
     ORDER BY total_mrr DESC`,
    [tenantId]
  );

  const insights = {
    best_lead_sources: bestSources,
    fastest_to_close: timeToClose,
    delivery_performance: deliveryPerformance,
    revenue_by_tier: revenueByTier,
    recommendations: generateRecommendations(bestSources, timeToClose, revenueByTier)
  };

  return res.status(200).json({
    success: true,
    insights
  });
}

/**
 * Generate AI recommendations based on patterns
 */
function generateRecommendations(sources, timeToClose, revenue) {
  const recommendations = [];

  // Recommend doubling down on best source
  if (sources.length > 0 && sources[0].conversion_rate > 20) {
    recommendations.push({
      type: 'double_down',
      priority: 'high',
      message: `${sources[0].lead_source} has ${sources[0].conversion_rate}% conversion rate. Invest more in this channel.`,
      action: `Increase ${sources[0].lead_source} prospecting by 2x`
    });
  }

  // Recommend cutting poor sources
  const poorSources = sources.filter(s => parseFloat(s.conversion_rate) < 5);
  if (poorSources.length > 0) {
    recommendations.push({
      type: 'cut_waste',
      priority: 'medium',
      message: `${poorSources.map(s => s.lead_source).join(', ')} have <5% conversion. Consider pausing.`,
      action: 'Redirect resources to higher-converting channels'
    });
  }

  // Recommend tier focus
  if (revenue.length > 0) {
    const topTier = revenue[0];
    recommendations.push({
      type: 'tier_focus',
      priority: 'high',
      message: `${topTier.client_tier} tier generates $${topTier.total_mrr}/month MRR. Focus here.`,
      action: `Target more ${topTier.client_tier} tier prospects`
    });
  }

  // Recommend faster sales cycles
  if (timeToClose.length > 0 && timeToClose[0].avg_days_to_close < 30) {
    recommendations.push({
      type: 'optimize_sales',
      priority: 'medium',
      message: `${timeToClose[0].lead_source} closes in ${timeToClose[0].avg_days_to_close} days. Replicate this process.`,
      action: 'Document and replicate fast-close playbook'
    });
  }

  return recommendations;
}

/**
 * Post insights to Mattermost #learning-loop
 */
async function postInsightsToMattermost(tenantId, res) {
  // Get latest insights
  const analysisResponse = await analyzePatterns(tenantId, { status: () => ({ json: (data) => data }) });
  const insights = analysisResponse.insights;

  // Format message
  const message = `📈 **Learning Loop Insights**\n\n` +
    `**Best Lead Sources:**\n${formatBestSources(insights.best_lead_sources)}\n\n` +
    `**Recommendations:**\n${formatRecommendations(insights.recommendations)}`;

  // Post to Mattermost
  await fetch('/api/mattermost-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'learning_loop',
      message,
      data: { insights }
    })
  });

  return res.status(200).json({
    success: true,
    message: 'Posted to #learning-loop'
  });
}

/**
 * Format best sources for Mattermost
 */
function formatBestSources(sources) {
  if (!sources || sources.length === 0) return 'No data yet';

  return sources.slice(0, 3).map((s, i) =>
    `${i + 1}. ${s.lead_source}: ${s.conversion_rate}% conversion, $${s.avg_deal_value || 0} avg deal`
  ).join('\n');
}

/**
 * Format recommendations for Mattermost
 */
function formatRecommendations(recommendations) {
  if (!recommendations || recommendations.length === 0) return 'No recommendations yet';

  return recommendations.map((r, i) =>
    `${i + 1}. [${r.priority.toUpperCase()}] ${r.message}`
  ).join('\n');
}

/**
 * Calculate insights from metrics
 */
async function calculateInsights(metrics, tenantId) {
  if (!metrics || metrics.length === 0) {
    return {
      trends: [],
      improvements: [],
      alerts: []
    };
  }

  const trends = [];
  const improvements = [];
  const alerts = [];

  // Group by metric type
  const byType = {};
  metrics.forEach(m => {
    if (!byType[m.metric_type]) byType[m.metric_type] = [];
    byType[m.metric_type].push(m);
  });

  // Analyze each metric type
  for (const [type, data] of Object.entries(byType)) {
    if (data.length < 2) continue;

    // Sort by date
    data.sort((a, b) => new Date(a.measurement_date) - new Date(b.measurement_date));

    const oldest = data[0];
    const newest = data[data.length - 1];

    const change = newest.current_value - oldest.current_value;
    const changePct = (change / oldest.current_value) * 100;

    if (Math.abs(changePct) > 10) {
      const direction = changePct > 0 ? 'increased' : 'decreased';
      trends.push({
        metric: type,
        change: changePct.toFixed(1),
        direction,
        message: `${type} ${direction} by ${Math.abs(changePct).toFixed(1)}%`
      });
    }

    // Check for improvements
    if (newest.improvement_pct && newest.improvement_pct > 20) {
      improvements.push({
        metric: type,
        improvement: newest.improvement_pct.toFixed(1),
        message: `${type} improved ${newest.improvement_pct.toFixed(1)}% from baseline`
      });
    }

    // Check for alerts (declining metrics)
    if (changePct < -15) {
      alerts.push({
        metric: type,
        severity: 'high',
        message: `⚠️ ${type} declining by ${Math.abs(changePct).toFixed(1)}%`
      });
    }
  }

  return { trends, improvements, alerts };
}
