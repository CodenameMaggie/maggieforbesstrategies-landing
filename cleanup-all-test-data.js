require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

/**
 * Comprehensive cleanup script to remove ALL test/mock data
 * - Test contacts (with 'test', 'example.com', etc.)
 * - Duplicate/spam tasks
 * - Contacts without emails
 * - Old social posts drafts
 */
async function cleanupAllTestData() {
  try {
    console.log('\n========================================');
    console.log('  COMPREHENSIVE TEST DATA CLEANUP');
    console.log('========================================\n');

    let totalDeleted = 0;

    // ==========================================
    // 1. TEST CONTACTS
    // ==========================================
    console.log('📋 Step 1: Finding test contacts...');
    const testContacts = await db.queryAll(`
      SELECT id, full_name, email, company, lead_source
      FROM contacts
      WHERE email LIKE '%test%'
         OR email LIKE '%example.com%'
         OR email LIKE '%@test%'
         OR full_name LIKE '%test%'
         OR full_name LIKE '%Test%'
         OR company LIKE '%test%'
         OR company LIKE '%Test%'
      ORDER BY created_at DESC
    `);

    if (testContacts.length > 0) {
      console.log(`\n   Found ${testContacts.length} test contacts:`);
      testContacts.forEach(contact => {
        console.log(`   • ${contact.full_name || 'No name'} (${contact.email || 'No email'}) - ${contact.company || 'No company'}`);
      });

      console.log(`\n   Deleting ${testContacts.length} test contacts...`);
      for (const contact of testContacts) {
        // Delete related data first
        await db.query('DELETE FROM contact_activities WHERE contact_id = $1', [contact.id]);
        await db.query('DELETE FROM tasks WHERE contact_id = $1', [contact.id]);
        await db.query('DELETE FROM contacts WHERE id = $1', [contact.id]);
      }
      console.log(`   ✅ Deleted ${testContacts.length} test contacts\n`);
      totalDeleted += testContacts.length;
    } else {
      console.log('   ✓ No test contacts found\n');
    }

    // ==========================================
    // 2. CONTACTS WITHOUT EMAILS
    // ==========================================
    console.log('📋 Step 2: Finding contacts without emails...');
    const noEmailContacts = await db.queryAll(`
      SELECT id, full_name, company, lead_source
      FROM contacts
      WHERE email IS NULL OR email = '' OR email = 'N/A'
      ORDER BY created_at DESC
    `);

    if (noEmailContacts.length > 0) {
      console.log(`\n   Found ${noEmailContacts.length} contacts without emails:`);
      noEmailContacts.forEach(contact => {
        console.log(`   • ${contact.full_name || 'No name'} - ${contact.company || 'No company'}`);
      });

      console.log(`\n   Deleting ${noEmailContacts.length} contacts...`);
      for (const contact of noEmailContacts) {
        await db.query('DELETE FROM contact_activities WHERE contact_id = $1', [contact.id]);
        await db.query('DELETE FROM tasks WHERE contact_id = $1', [contact.id]);
        await db.query('DELETE FROM contacts WHERE id = $1', [contact.id]);
      }
      console.log(`   ✅ Deleted ${noEmailContacts.length} contacts without emails\n`);
      totalDeleted += noEmailContacts.length;
    } else {
      console.log('   ✓ No contacts without emails\n');
    }

    // ==========================================
    // 3. DUPLICATE/SPAM TASKS
    // ==========================================
    console.log('📋 Step 3: Finding duplicate/spam tasks...');
    const spamTasks = await db.query(`
      DELETE FROM tasks
      WHERE source = 'cron_social'
      AND title LIKE '%draft posts need attention%'
      RETURNING id, title
    `);

    if (spamTasks.rowCount > 0) {
      console.log(`   ✅ Deleted ${spamTasks.rowCount} duplicate social media tasks\n`);
      totalDeleted += spamTasks.rowCount;
    } else {
      console.log('   ✓ No spam tasks found\n');
    }

    // ==========================================
    // 4. OLD DRAFT SOCIAL POSTS
    // ==========================================
    console.log('📋 Step 4: Finding old draft social posts...');
    const oldDrafts = await db.query(`
      DELETE FROM social_posts
      WHERE status = 'draft'
      AND created_at < NOW() - INTERVAL '30 days'
      RETURNING id, platform, created_at
    `);

    if (oldDrafts.rowCount > 0) {
      console.log(`   ✅ Deleted ${oldDrafts.rowCount} old draft social posts\n`);
      totalDeleted += oldDrafts.rowCount;
    } else {
      console.log('   ✓ No old draft posts found\n');
    }

    // ==========================================
    // 5. TEST TASKS (tasks with 'test' in title)
    // ==========================================
    console.log('📋 Step 5: Finding test tasks...');
    const testTasks = await db.query(`
      DELETE FROM tasks
      WHERE title LIKE '%test%'
         OR title LIKE '%Test%'
         OR title LIKE '%TESTING%'
      RETURNING id, title
    `);

    if (testTasks.rowCount > 0) {
      console.log(`   ✅ Deleted ${testTasks.rowCount} test tasks\n`);
      totalDeleted += testTasks.rowCount;
    } else {
      console.log('   ✓ No test tasks found\n');
    }

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log('========================================');
    console.log(`  CLEANUP COMPLETE`);
    console.log(`  Total items deleted: ${totalDeleted}`);
    console.log('========================================\n');

    // Show what remains
    const remainingContacts = await db.queryOne(`SELECT COUNT(*) as count FROM contacts`);
    const remainingTasks = await db.queryOne(`SELECT COUNT(*) as count FROM tasks`);
    const remainingSocial = await db.queryOne(`SELECT COUNT(*) as count FROM social_posts`);

    console.log('📊 Database Summary:');
    console.log(`   • Contacts: ${remainingContacts.count}`);
    console.log(`   • Tasks: ${remainingTasks.count}`);
    console.log(`   • Social Posts: ${remainingSocial.count}\n`);

    if (parseInt(remainingContacts.count) > 0) {
      const remaining = await db.queryAll(`
        SELECT id, full_name, email, company, stage
        FROM contacts
        ORDER BY created_at DESC
        LIMIT 10
      `);
      console.log('📇 Sample remaining contacts (latest 10):');
      remaining.forEach(contact => {
        console.log(`   • ${contact.full_name || 'No name'} (${contact.email || 'No email'}) - ${contact.stage || 'new'}`);
      });
      console.log('');
    }

    console.log('✨ All test data has been cleaned up!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run cleanup
cleanupAllTestData();
