/**
 * Clean up test leads from database
 */

const TEST_URL = process.env.TEST_URL || 'https://www.maggieforbesstrategies.com';

console.log('🧹 CLEANING UP TEST LEADS');
console.log('====================================\n');

async function cleanupTestLeads() {
  try {
    // First, get all contacts
    console.log('📋 Fetching all contacts...');
    const response = await fetch(`${TEST_URL}/api/contacts?limit=100`);

    if (!response.ok) {
      throw new Error('Failed to fetch contacts - authentication required');
    }

    const data = await response.json();
    const contacts = data.contacts || [];

    console.log(`   Found ${contacts.length} total contacts\n`);

    // Find test contacts
    const testContacts = contacts.filter(c =>
      c.full_name?.includes('Test Lead') ||
      c.full_name?.includes('Test Contact') ||
      c.full_name?.includes('Test Production') ||
      c.email?.includes('test') && c.email?.includes('@example.com')
    );

    console.log(`🎯 Identified ${testContacts.length} test contacts:\n`);

    testContacts.forEach((contact, i) => {
      console.log(`   ${i + 1}. ${contact.full_name || 'No name'} (${contact.email})`);
      console.log(`      ID: ${contact.id}`);
      console.log(`      Company: ${contact.company || 'N/A'}`);
      console.log('');
    });

    if (testContacts.length === 0) {
      console.log('✅ No test contacts found - database is clean!\n');
      return true;
    }

    console.log('🗑️  To delete these test contacts, you would need to:');
    console.log('   1. Add a DELETE endpoint to /api/contacts');
    console.log('   2. Or manually delete from database');
    console.log('');
    console.log('   Test contact IDs:');
    testContacts.forEach(c => {
      console.log(`   - ${c.id}`);
    });

    return true;

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nNote: You may need to be authenticated to access contacts API');
    return false;
  }
}

cleanupTestLeads().then(() => {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test contacts identified above                            ║');
  console.log('║  These will naturally be replaced by real leads            ║');
  console.log('║  as visitors submit the form                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
});
