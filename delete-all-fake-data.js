require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

/**
 * AGGRESSIVE FAKE DATA REMOVAL
 * Delete ALL contacts that look even slightly fake
 */
async function deleteAllFakeData() {
  console.log('\n========================================');
  console.log('  AGGRESSIVE FAKE DATA CLEANUP');
  console.log('========================================\n');

  try {
    // First, get IDs of fake contacts
    const fakeContacts = await db.queryAll(`
      SELECT id, full_name, company, email FROM contacts
      WHERE
        -- Generic company names
        company ILIKE '%Corp%' OR
        company ILIKE '%Inc%' OR
        company ILIKE '%LLC%' OR
        company ILIKE '%Ltd%' OR
        company ILIKE '%Solutions%' OR
        company ILIKE '%Tech%' OR
        company ILIKE '%Innovations%' OR
        company ILIKE '%Example%' OR
        company ILIKE '%Sample%' OR
        company ILIKE '%Test%' OR
        company ILIKE '%Demo%' OR
        company ILIKE '%Acme%' OR
        company ILIKE '%Placeholder%' OR

        -- Generic names
        full_name ILIKE '%CEO%' OR
        full_name ILIKE '%Executive%' OR
        full_name ILIKE '%Founder%' OR
        full_name ILIKE '%Test%' OR
        full_name ILIKE '%Example%' OR
        full_name ILIKE '%Sample%' OR
        full_name ILIKE 'Jane Doe%' OR
        full_name ILIKE 'John Smith%' OR
        full_name ILIKE 'John Doe%' OR

        -- Placeholder emails
        email ILIKE '%example.com%' OR
        email ILIKE '%test%' OR
        email ILIKE '%.PLACEHOLDER%' OR
        email ILIKE '%@placeholder%' OR
        email IS NULL OR
        email = '' OR
        email = 'N/A' OR

        -- Generic industries/signals
        notes ILIKE '%Example%' OR
        notes ILIKE '%placeholder%' OR
        notes ILIKE '%generic%'
    `);

    console.log(`\n📋 Found ${fakeContacts.length} fake/placeholder contacts\n`);

    if (fakeContacts.length === 0) {
      console.log('✅ No fake data found!\n');
      process.exit(0);
    }

    console.log('Contacts to delete:');
    fakeContacts.forEach(row => {
      console.log(`  • ${row.full_name} at ${row.company} (${row.email})`);
    });

    // Delete related data first (foreign key constraints)
    console.log('\n🗑️  Deleting related data...');
    let totalDeleted = 0;

    for (const contact of fakeContacts) {
      // Delete tasks
      const tasksResult = await db.query(
        'DELETE FROM tasks WHERE contact_id = $1',
        [contact.id]
      );
      totalDeleted += tasksResult.rowCount || 0;

      // Delete activities
      const activitiesResult = await db.query(
        'DELETE FROM contact_activities WHERE contact_id = $1',
        [contact.id]
      );
      totalDeleted += activitiesResult.rowCount || 0;

      // Delete contact
      await db.query('DELETE FROM contacts WHERE id = $1', [contact.id]);
    }

    console.log(`✅ Deleted ${fakeContacts.length} contacts and ${totalDeleted} related records\n`);

    // Show what's left
    const remaining = await db.queryOne('SELECT COUNT(*) as count FROM contacts');
    console.log(`\n📊 Remaining contacts: ${remaining.count}`);

    if (parseInt(remaining.count) > 0) {
      const contacts = await db.queryAll(`
        SELECT full_name, company, email, stage, created_at
        FROM contacts
        ORDER BY created_at DESC
        LIMIT 20
      `);

      console.log('\n📇 Remaining contacts (latest 20):');
      contacts.forEach(c => {
        console.log(`  • ${c.full_name} at ${c.company} - ${c.stage}`);
      });
    } else {
      console.log('\n✨ Database is completely clean!\n');
    }

    console.log('\n========================================');
    console.log('  CLEANUP COMPLETE');
    console.log('========================================\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

deleteAllFakeData();
