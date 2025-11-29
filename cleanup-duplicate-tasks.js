require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

async function cleanupDuplicateTasks() {
  try {
    console.log('\n=== CLEANING UP DUPLICATE TASKS ===\n');

    // Delete all social draft reminder tasks (they're spam)
    const result = await db.query(`
      DELETE FROM tasks
      WHERE source = 'cron_social'
      AND title LIKE '%draft posts need attention%'
      RETURNING id, title
    `);

    console.log(`✅ Deleted ${result.rowCount} duplicate social media tasks`);

    // Show remaining tasks
    const remainingTasks = await db.queryOne(`SELECT COUNT(*) as count FROM tasks`);
    console.log(`\n📊 Remaining tasks: ${remainingTasks.count}`);

    if (parseInt(remainingTasks.count) > 0) {
      const remaining = await db.queryAll(`
        SELECT id, title, status, priority, source
        FROM tasks
        ORDER BY created_at DESC
      `);
      console.log('\nRemaining tasks:');
      remaining.forEach(task => {
        console.log(`  #${task.id} - [${task.status}] ${task.title} (Source: ${task.source})`);
      });
    } else {
      console.log('✨ No tasks remaining - fresh start!');
    }

    console.log('\n=== CLEANUP COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupDuplicateTasks();
