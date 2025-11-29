require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

async function cleanupOldSocialPosts() {
  try {
    console.log('\n=== CLEANING UP OLD SOCIAL POSTS ===\n');

    // Delete old draft posts (3+ days old)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const result = await db.query(`
      DELETE FROM social_posts
      WHERE status = 'draft'
      AND created_at < $1
      RETURNING id, platform, post_type, created_at
    `, [threeDaysAgo]);

    console.log(`✅ Deleted ${result.rowCount} old draft posts`);

    if (result.rowCount > 0) {
      result.rows.forEach(post => {
        console.log(`  ✓ Deleted: ${post.platform} - ${post.post_type} (created ${new Date(post.created_at).toLocaleDateString()})`);
      });
    }

    // Show remaining posts
    const remainingPosts = await db.queryOne(`SELECT COUNT(*) as count FROM social_posts`);
    console.log(`\n📊 Remaining social posts: ${remainingPosts.count}`);

    console.log('\n=== CLEANUP COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupOldSocialPosts();
