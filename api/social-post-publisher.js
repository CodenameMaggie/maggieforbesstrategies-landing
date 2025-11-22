const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
    const { data: scheduledPosts, error } = await supabase
      .from('social_posts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true });

    if (error) {
      console.error('[MFS Social Publisher] Error fetching posts:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch scheduled posts'
      });
    }

    console.log(`[MFS Social Publisher] Found ${scheduledPosts?.length || 0} posts ready to publish`);

    for (const post of scheduledPosts || []) {
      try {
        // Create task to manually publish
        await supabase
          .from('tasks')
          .insert({
            tenant_id: tenantId,
            title: `Publish ${post.platform} post`,
            description: `Post content:\n\n${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}`,
            priority: 'medium',
            status: 'pending',
            source: 'cron_social',
            due_date_text: 'Now',
            created_at: new Date().toISOString()
          });

        // Update post status to 'ready' (indicates it's been flagged for publishing)
        await supabase
          .from('social_posts')
          .update({
            status: 'ready',
            updated_at: new Date().toISOString()
          })
          .eq('id', post.id);

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

    const { data: staleDrafts } = await supabase
      .from('social_posts')
      .select('id, platform, content, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'draft')
      .lt('created_at', threeDaysAgo)
      .limit(5);

    if (staleDrafts && staleDrafts.length > 0) {
      // Create a single task for stale drafts
      await supabase
        .from('tasks')
        .insert({
          tenant_id: tenantId,
          title: `${staleDrafts.length} draft posts need attention`,
          description: `You have ${staleDrafts.length} draft social posts older than 3 days. Review and schedule or delete them.`,
          priority: 'low',
          status: 'pending',
          source: 'cron_social',
          due_date_text: 'This week',
          created_at: new Date().toISOString()
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
