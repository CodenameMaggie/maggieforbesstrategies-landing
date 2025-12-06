/**
 * Delete test leads from database
 */

const TEST_URL = process.env.TEST_URL || 'https://www.maggieforbesstrategies.com';

console.log('🗑️  DELETING TEST LEADS');
console.log('====================================\n');

async function deleteTestLeads() {
  try {
    // First, get all contacts
    console.log('📋 Fetching all contacts...');
    const response = await fetch(`${TEST_URL}/api/contacts?limit=100`);

    if (!response.ok) {
      throw new Error('Failed to fetch contacts - authentication may be required');
    }

    const data = await response.json();
    const contacts = data.contacts || [];

    console.log(`   Found ${contacts.length} total contacts\n`);

    // Find test contacts
    const testContacts = contacts.filter(c =>
      c.full_name?.includes('Test Lead') ||
      c.full_name?.includes('Test Contact') ||
      c.full_name?.includes('Test Production') ||
      (c.email?.includes('test') && c.email?.includes('@example.com'))
    );

    if (testContacts.length === 0) {
      console.log('✅ No test contacts found - database is clean!\n');
      return true;
    }

    console.log(`🎯 Found ${testContacts.length} test contacts to delete:\n`);

    // Delete each test contact
    let deleted = 0;
    let failed = 0;

    for (const contact of testContacts) {
      try {
        console.log(`   Deleting: ${contact.full_name} (${contact.email})...`);

        const deleteResponse = await fetch(`${TEST_URL}/api/contacts?id=${contact.id}`, {
          method: 'DELETE'
        });

        const result = await deleteResponse.json();

        if (deleteResponse.ok && result.success) {
          console.log(`   ✅ Deleted successfully`);
          deleted++;
        } else {
          console.log(`   ❌ Failed: ${result.error || 'Unknown error'}`);
          failed++;
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        failed++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════');
    console.log(`✅ Deleted: ${deleted}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('═══════════════════════════════════\n');

    return failed === 0;

  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

deleteTestLeads().then(success => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  if (success) {
    console.log('║  ✅ TEST CLEANUP COMPLETE                                  ║');
    console.log('║                                                            ║');
    console.log('║  All test contacts have been removed.                     ║');
    console.log('║  Your dashboard is now ready for real leads!              ║');
  } else {
    console.log('║  ⚠️  CLEANUP INCOMPLETE                                     ║');
    console.log('║                                                            ║');
    console.log('║  Some test contacts may still remain.                     ║');
  }
  console.log('╚════════════════════════════════════════════════════════════╝');
  process.exit(success ? 0 : 1);
});
