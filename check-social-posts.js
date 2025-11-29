require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

async function checkSocialPosts() {
  try {
    console.log('\n=== CHECKING SOCIAL POSTS ===\n');

    // Count total posts
    const totalCount = await db.queryOne(`SELECT COUNT(*) as count FROM social_posts`);
    console.log(`✓ Total social posts: ${totalCount.count}`);

    // Count by status
    const byStatus = await db.queryAll(`
      SELECT status, COUNT(*) as count
      FROM social_posts
      GROUP BY status
      ORDER BY count DESC
    `);
    console.log('\n✓ Posts by status:');
    if (byStatus.length === 0) {
      console.log('  - No posts yet');
    } else {
      byStatus.forEach(row => {
        console.log(`  - ${row.status}: ${row.count}`);
      });
    }

    // Show all posts
    const allPosts = await db.queryAll(`
      SELECT id, platform, post_type, status, content, created_at
      FROM social_posts
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log(`\n✓ Recent posts (showing up to 10):`);
    if (allPosts.length === 0) {
      console.log('  - No posts in system');
    } else {
      allPosts.forEach(post => {
        console.log(`\n  #${post.id} - [${post.status.toUpperCase()}] ${post.platform} - ${post.post_type}`);
        console.log(`    Content: ${post.content?.substring(0, 100)}${post.content?.length > 100 ? '...' : ''}`);
        console.log(`    Created: ${new Date(post.created_at).toLocaleString()}`);
      });
    }

    console.log('\n=== CHECK COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('Error checking social posts:', error);
    process.exit(1);
  }
}

checkSocialPosts();
