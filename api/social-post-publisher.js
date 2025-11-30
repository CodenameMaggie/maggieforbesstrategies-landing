const db = require('./utils/db');

/**
 * MFS Social Post Publisher
 * Runs as CRON job to publish scheduled social media posts
 *
 * Schedule: Every 15 minutes (0/15 * * * *)
 *
 * Note: This creates tasks for manual posting since direct API posting
 * requires platform-specific OAuth setup. Can be extended later.
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

  // CRON_SECRET protection - prevent unauthorized task creation
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers['x-cron-secret'] || req.headers['authorization'];
    if (authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('[MFS Social Publisher] Unauthorized access attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    console.log('[MFS Social Publisher] Starting...');

    const tenantId = process.env.MFS_TENANT_ID;
    const now = new Date();

    const results = {
      posts_ready: 0,
      tasks_created: 0,
      errors: []
    };

    // Find posts scheduled for now or past that haven't been published
    const scheduledPosts = await db.queryAll(`
      SELECT *
      FROM social_posts
      WHERE tenant_id = $1
      AND status = 'scheduled'
      AND scheduled_for <= $2
      ORDER BY scheduled_for ASC
    `, [tenantId, now.toISOString()]);

    console.log(`[MFS Social Publisher] Found ${scheduledPosts.length} posts ready to publish`);

    for (const post of scheduledPosts) {
      try {
        // Create task to manually publish
        await db.insert('tasks', {
          tenant_id: tenantId,
          title: `Publish ${post.platform} post`,
          description: `Post content:\n\n${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}`,
          priority: 'medium',
          status: 'pending',
          source: 'cron_social',
          due_date_text: 'Now',
          created_at: new Date()
        });

        // Update post status to 'ready' (indicates it's been flagged for publishing)
        await db.query(`
          UPDATE social_posts
          SET status = 'ready', updated_at = $1
          WHERE id = $2
        `, [new Date(), post.id]);

        results.posts_ready++;
        results.tasks_created++;

        console.log(`[MFS Social Publisher] Flagged post ${post.id} for ${post.platform}`);

      } catch (postError) {
        console.error(`[MFS Social Publisher] Error processing post ${post.id}:`, postError);
        results.errors.push({
          post_id: post.id,
          error: postError.message
        });
      }
    }

    // Also check for draft posts that might need attention (older than 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const staleDrafts = await db.queryAll(`
      SELECT id, platform, content, created_at
      FROM social_posts
      WHERE tenant_id = $1
      AND status = 'draft'
      AND created_at < $2
      LIMIT 5
    `, [tenantId, threeDaysAgo]);

    if (staleDrafts && staleDrafts.length > 0) {
      // Create a single task for stale drafts
      await db.insert('tasks', {
        tenant_id: tenantId,
        title: `${staleDrafts.length} draft posts need attention`,
        description: `You have ${staleDrafts.length} draft social posts older than 3 days. Review and schedule or delete them.`,
        priority: 'low',
        status: 'pending',
        source: 'cron_social',
        due_date_text: 'This week',
        created_at: new Date()
      });

      console.log(`[MFS Social Publisher] Flagged ${staleDrafts.length} stale drafts`);
    }

    console.log('[MFS Social Publisher] Complete');

    return res.status(200).json({
      success: true,
      message: 'Social post publisher processed',
      results: results
    });

  } catch (error) {
    console.error('[MFS Social Publisher] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Social post publisher failed',
      details: error.message
    });
  }
};
