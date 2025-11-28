require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log('Running performance index migration...');

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'migrations/001-performance-indexes.sql'), 'utf8');
    const result = await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log(result.rows[result.rows.length - 1]);

    // List all indexes
    const indexes = await pool.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname
    `);

    console.log('\n📊 Indexes created:');
    indexes.rows.forEach(row => {
      console.log(`  ${row.tablename}.${row.indexname}`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().then(() => process.exit(0)).catch(err => process.exit(1));
