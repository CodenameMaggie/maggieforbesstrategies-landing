require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

async function removeTestData() {
  try {
    console.log('\n=== REMOVING UNUSABLE/TEST DATA ===\n');

    // Find test contacts
    const testContacts = await db.queryAll(`
      SELECT id, full_name, email, company, lead_source
      FROM contacts
      WHERE email LIKE '%test%'
         OR email LIKE '%example.com%'
         OR full_name LIKE '%test%'
         OR full_name LIKE '%Test%'
         OR company LIKE '%test%'
      ORDER BY created_at DESC
    `);

    console.log(`Found ${testContacts.length} test/unusable contacts:`);
    testContacts.forEach(contact => {
      console.log(`  #${contact.id} - ${contact.full_name} (${contact.email}) at ${contact.company || 'N/A'}`);
    });

    if (testContacts.length === 0) {
      console.log('\n✓ No test data found!');
      process.exit(0);
      return;
    }

    // Delete test contacts and their activities
    console.log(`\nDeleting ${testContacts.length} test contacts and their activities...`);

    for (const contact of testContacts) {
      // Delete activities first (foreign key constraint)
      const activitiesDeleted = await db.query(
        'DELETE FROM contact_activities WHERE contact_id = $1',
        [contact.id]
      );

      // Delete tasks
      const tasksDeleted = await db.query(
        'DELETE FROM tasks WHERE contact_id = $1',
        [contact.id]
      );

      // Delete contact
      await db.query('DELETE FROM contacts WHERE id = $1', [contact.id]);

      console.log(`  ✓ Deleted: ${contact.full_name} (${contact.email})`);
    }

    console.log(`\n✅ Cleanup complete! Deleted ${testContacts.length} test contacts.`);

    // Show what's left
    const remainingContacts = await db.queryOne(`SELECT COUNT(*) as count FROM contacts`);
    console.log(`\n📊 Remaining contacts: ${remainingContacts.count}`);

    if (parseInt(remainingContacts.count) > 0) {
      const remaining = await db.queryAll(`
        SELECT id, full_name, email, company, stage, lead_source
        FROM contacts
        ORDER BY created_at DESC
      `);
      console.log('\nRemaining contacts:');
      remaining.forEach(contact => {
        console.log(`  #${contact.id} - ${contact.full_name || 'No name'} (${contact.email || 'No email'}) - ${contact.stage} - Source: ${contact.lead_source || 'Unknown'}`);
      });
    }

    console.log('\n=== CLEANUP COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

removeTestData();
