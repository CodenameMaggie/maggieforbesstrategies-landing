require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

async function checkTasks() {
  try {
    console.log('\n=== CHECKING TASKS ===\n');

    // Count total tasks
    const totalCount = await db.queryOne(`SELECT COUNT(*) as count FROM tasks`);
    console.log(`✓ Total tasks: ${totalCount.count}`);

    // Count by status
    const byStatus = await db.queryAll(`
      SELECT status, COUNT(*) as count
      FROM tasks
      GROUP BY status
      ORDER BY count DESC
    `);
    console.log('\n✓ Tasks by status:');
    if (byStatus.length === 0) {
      console.log('  - No tasks yet');
    } else {
      byStatus.forEach(row => {
        console.log(`  - ${row.status}: ${row.count}`);
      });
    }

    // Count by priority
    const byPriority = await db.queryAll(`
      SELECT priority, COUNT(*) as count
      FROM tasks
      GROUP BY priority
      ORDER BY count DESC
    `);
    console.log('\n✓ Tasks by priority:');
    if (byPriority.length === 0) {
      console.log('  - No tasks yet');
    } else {
      byPriority.forEach(row => {
        console.log(`  - ${row.priority}: ${row.count}`);
      });
    }

    // Count by source
    const bySource = await db.queryAll(`
      SELECT source, COUNT(*) as count
      FROM tasks
      GROUP BY source
      ORDER BY count DESC
    `);
    console.log('\n✓ Tasks by source:');
    if (bySource.length === 0) {
      console.log('  - No tasks yet');
    } else {
      bySource.forEach(row => {
        console.log(`  - ${row.source}: ${row.count}`);
      });
    }

    // Show all tasks
    const allTasks = await db.queryAll(`
      SELECT t.*, c.full_name, c.email
      FROM tasks t
      LEFT JOIN contacts c ON t.contact_id = c.id
      ORDER BY t.created_at DESC
    `);

    console.log(`\n✓ All tasks (${allTasks.length} total):`);
    if (allTasks.length === 0) {
      console.log('  - No tasks in system');
    } else {
      allTasks.forEach(task => {
        const contactInfo = task.full_name ? `${task.full_name} (${task.email})` : 'No contact';
        console.log(`\n  #${task.id} - [${task.status.toUpperCase()}] ${task.title}`);
        console.log(`    Priority: ${task.priority} | Source: ${task.source} | Contact: ${contactInfo}`);
        console.log(`    Due: ${task.due_date_text || 'No due date'}`);
        if (task.description) {
          console.log(`    Description: ${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}`);
        }
        console.log(`    Created: ${new Date(task.created_at).toLocaleString()}`);
      });
    }

    console.log('\n=== CHECK COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('Error checking tasks:', error);
    process.exit(1);
  }
}

checkTasks();
