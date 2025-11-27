const db = require('./db');

/**
 * Database migration to make email field nullable
 * Run this once to fix the contacts table
 */
async function migrateEmailToNullable() {
  try {
    console.log('[Migration] Making email field nullable...');

    await db.query(`
      ALTER TABLE contacts
      ALTER COLUMN email DROP NOT NULL
    `);

    console.log('[Migration] ✅ Email field is now nullable');
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Error:', error.message);
    process.exit(1);
  }
}

migrateEmailToNullable();
