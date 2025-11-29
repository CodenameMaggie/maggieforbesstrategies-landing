require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration(migrationFile) {
  console.log(`Running migration: ${migrationFile}...`);

  try {
    const sql = fs.readFileSync(path.join(__dirname, migrationFile), 'utf8');
    await pool.query(sql);

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run-specific-migration.js <migration-file>');
  console.error('Example: node run-specific-migration.js migrations/005-consultation-tables.sql');
  process.exit(1);
}

runMigration(migrationFile).then(() => process.exit(0)).catch(err => process.exit(1));
