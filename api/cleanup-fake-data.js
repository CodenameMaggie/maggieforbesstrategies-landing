const db = require('./utils/db');

/**
 * API Endpoint to Clean Fake Data
 * GET /api/cleanup-fake-data
 */
module.exports = async (req, res) => {
  // CORS headers
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://maggieforbesstrategies.com',
    'https://www.maggieforbesstrategies.com',
    'http://localhost:3000'
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('\n[Cleanup API] Starting fake data cleanup...');

    // Find fake contacts
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

    console.log(`[Cleanup API] Found ${fakeContacts.length} fake contacts`);

    if (fakeContacts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No fake data found',
        deleted: 0
      });
    }

    // Delete related data first
    let totalRelatedDeleted = 0;
    for (const contact of fakeContacts) {
      // Delete tasks
      const tasksResult = await db.query(
        'DELETE FROM tasks WHERE contact_id = $1',
        [contact.id]
      );
      totalRelatedDeleted += tasksResult.rowCount || 0;

      // Delete activities
      const activitiesResult = await db.query(
        'DELETE FROM contact_activities WHERE contact_id = $1',
        [contact.id]
      );
      totalRelatedDeleted += activitiesResult.rowCount || 0;

      // Delete contact
      await db.query('DELETE FROM contacts WHERE id = $1', [contact.id]);
    }

    console.log(`[Cleanup API] ✅ Deleted ${fakeContacts.length} contacts and ${totalRelatedDeleted} related records`);

    // Get remaining count
    const remaining = await db.queryOne('SELECT COUNT(*) as count FROM contacts');

    return res.status(200).json({
      success: true,
      message: 'Cleanup complete',
      deleted: {
        contacts: fakeContacts.length,
        relatedRecords: totalRelatedDeleted
      },
      remaining: parseInt(remaining.count),
      deletedContacts: fakeContacts.map(c => ({
        name: c.full_name,
        company: c.company,
        email: c.email
      }))
    });

  } catch (error) {
    console.error('[Cleanup API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
