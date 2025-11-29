require('dotenv').config({ path: '.env.local' });
const db = require('./api/utils/db');

async function checkContacts() {
  try {
    console.log('\n=== CHECKING CONTACTS TABLE ===\n');

    // Check if new columns exist
    const columnsCheck = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'contacts'
      AND column_name IN ('client_tier', 'unbound_user_id', 'client_status', 'mrr', 'client_since', 'stripe_customer_id')
      ORDER BY column_name
    `);

    console.log('✓ New columns in contacts table:');
    columnsCheck.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    // Count total contacts
    const totalCount = await db.queryOne(`SELECT COUNT(*) as count FROM contacts`);
    console.log(`\n✓ Total contacts: ${totalCount.count}`);

    // Count by stage
    const byStage = await db.queryAll(`
      SELECT stage, COUNT(*) as count
      FROM contacts
      GROUP BY stage
      ORDER BY count DESC
    `);
    console.log('\n✓ Contacts by stage:');
    byStage.forEach(row => {
      console.log(`  - ${row.stage}: ${row.count}`);
    });

    // Count by lead source
    const bySource = await db.queryAll(`
      SELECT lead_source, COUNT(*) as count
      FROM contacts
      WHERE lead_source IS NOT NULL
      GROUP BY lead_source
      ORDER BY count DESC
    `);
    console.log('\n✓ Contacts by lead source:');
    bySource.forEach(row => {
      console.log(`  - ${row.lead_source}: ${row.count}`);
    });

    // Count by client tier
    const byTier = await db.queryAll(`
      SELECT client_tier, COUNT(*) as count
      FROM contacts
      WHERE client_tier IS NOT NULL
      GROUP BY client_tier
      ORDER BY count DESC
    `);
    console.log('\n✓ Contacts by client tier:');
    if (byTier.length === 0) {
      console.log('  - No clients provisioned yet');
    } else {
      byTier.forEach(row => {
        console.log(`  - ${row.client_tier}: ${row.count}`);
      });
    }

    // Show recent contacts (last 10)
    const recentContacts = await db.queryAll(`
      SELECT id, full_name, email, company, stage, lead_source, client_tier, created_at
      FROM contacts
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log('\n✓ Recent contacts (last 10):');
    recentContacts.forEach(contact => {
      console.log(`  #${contact.id} - ${contact.full_name || 'No name'} (${contact.email || 'No email'}) - ${contact.stage} - Source: ${contact.lead_source || 'Unknown'} - Tier: ${contact.client_tier || 'None'} - Created: ${new Date(contact.created_at).toLocaleDateString()}`);
    });

    // Check for unbound leads specifically
    const unboundLeads = await db.queryAll(`
      SELECT id, full_name, email, company, stage, lead_source, created_at
      FROM contacts
      WHERE lead_source = 'unbounce' OR lead_source = 'unbound'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log('\n✓ Unbound leads:');
    if (unboundLeads.length === 0) {
      console.log('  - No Unbound leads found yet');
    } else {
      unboundLeads.forEach(contact => {
        console.log(`  #${contact.id} - ${contact.full_name} (${contact.email}) - ${contact.stage} - Created: ${new Date(contact.created_at).toLocaleDateString()}`);
      });
    }

    // Check recent contact activities
    const recentActivities = await db.queryAll(`
      SELECT ca.*, c.full_name, c.email
      FROM contact_activities ca
      LEFT JOIN contacts c ON ca.contact_id = c.id
      ORDER BY ca.created_at DESC
      LIMIT 10
    `);
    console.log('\n✓ Recent contact activities (last 10):');
    if (recentActivities.length === 0) {
      console.log('  - No activities yet');
    } else {
      recentActivities.forEach(activity => {
        console.log(`  [${activity.type}] ${activity.full_name || 'Unknown'} - ${activity.description} - ${new Date(activity.created_at).toLocaleDateString()}`);
      });
    }

    console.log('\n=== CHECK COMPLETE ===\n');
    process.exit(0);

  } catch (error) {
    console.error('Error checking contacts:', error);
    process.exit(1);
  }
}

checkContacts();
