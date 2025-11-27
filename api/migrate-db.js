const db = require('./utils/db');

/**
 * DATABASE MIGRATION ENDPOINT
 * Makes email field nullable so prospects without emails can be saved
 */
module.exports = async (req, res) => {
  try {
    console.log('[Migration] Making email field nullable...');

    await db.query(`
      ALTER TABLE contacts
      ALTER COLUMN email DROP NOT NULL
    `);

    console.log('[Migration] ✅ Success');

    return res.status(200).json({
      success: true,
      message: 'Database migrated: email field is now nullable'
    });
  } catch (error) {
    // If already nullable, postgres returns an error - that's okay
    if (error.message.includes('does not exist')) {
      return res.status(200).json({
        success: true,
        message: 'Email field already nullable - no migration needed'
      });
    }

    console.error('[Migration] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
