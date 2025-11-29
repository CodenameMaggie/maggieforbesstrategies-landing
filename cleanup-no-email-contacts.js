require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

async function cleanupNoEmailContacts() {
  try {
    console.log('\n=== CLEANING UP CONTACTS WITHOUT EMAILS ===\n');

    // Find contacts without emails
    const noEmailContacts = await db.queryAll(`
      SELECT id, full_name, company, lead_source, created_at
      FROM contacts
      WHERE email IS NULL OR email = ''
      ORDER BY created_at DESC
    `);

    console.log(`Found ${noEmailContacts.length} contacts without emails:`);
    noEmailContacts.forEach(contact => {
      console.log(`  #${contact.id} - ${contact.full_name} at ${contact.company} (Source: ${contact.lead_source})`);
    });

    if (noEmailContacts.length === 0) {
      console.log('\n✓ No contacts to clean up!');
      process.exit(0);
      return;
    }

    // Delete them
    console.log(`\nDeleting ${noEmailContacts.length} contacts without emails...`);

    for (const contact of noEmailContacts) {
      await db.query('DELETE FROM contacts WHERE id = $1', [contact.id]);
      console.log(`  ✓ Deleted: ${contact.full_name} at ${contact.company}`);
    }

    console.log(`\n✅ Cleanup complete! Deleted ${noEmailContacts.length} contacts.`);
    console.log('\n=== CLEANUP COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupNoEmailContacts();
