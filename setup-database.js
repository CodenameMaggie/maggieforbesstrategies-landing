/**
 * DIRECT DATABASE SETUP SCRIPT
 * Run this locally to create all tables for the high-end client acquisition system
 *
 * Usage: node setup-database.js
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function setupDatabase() {
  console.log('🚀 Starting database setup...\n');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    // 1. THOUGHT LEADERSHIP TABLES
    console.log('📝 Creating Thought Leadership tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS thought_leadership_content (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        summary TEXT,
        body TEXT,
        key_insights JSONB,
        publish_date TIMESTAMP,
        platforms JSONB,
        target_audience VARCHAR(255),
        industry_focus VARCHAR(255),
        keywords TEXT[],
        views INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        leads_generated INTEGER DEFAULT 0,
        created_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP
      );
    `);
    console.log('  ✓ thought_leadership_content');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS speaking_opportunities (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        event_name VARCHAR(500) NOT NULL,
        event_type VARCHAR(100),
        event_date TIMESTAMP,
        event_url VARCHAR(1000),
        status VARCHAR(50) DEFAULT 'prospect',
        topic VARCHAR(500),
        audience_size INTEGER,
        audience_type VARCHAR(255),
        organizer_name VARCHAR(255),
        organizer_email VARCHAR(255),
        organizer_company VARCHAR(255),
        leads_generated INTEGER DEFAULT 0,
        follow_up_meetings INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ speaking_opportunities');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS thought_leadership_metrics (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        content_id INTEGER REFERENCES thought_leadership_content(id),
        metric_date DATE NOT NULL,
        metric_type VARCHAR(100),
        metric_value INTEGER DEFAULT 0,
        source VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ thought_leadership_metrics');

    // 2. ABM TABLES
    console.log('\n🎯 Creating ABM tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS abm_target_accounts (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        company_name VARCHAR(500) NOT NULL,
        company_domain VARCHAR(255),
        industry VARCHAR(255),
        company_size VARCHAR(100),
        annual_revenue VARCHAR(100),
        status VARCHAR(50) DEFAULT 'prospecting',
        priority VARCHAR(50) DEFAULT 'medium',
        estimated_deal_value DECIMAL(12,2),
        strategic_importance VARCHAR(50),
        pain_points TEXT,
        our_fit_score INTEGER,
        buying_signals JSONB,
        decision_making_process TEXT,
        budget_cycle VARCHAR(100),
        competitors JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        first_contact_date TIMESTAMP,
        last_activity_date TIMESTAMP
      );
    `);
    console.log('  ✓ abm_target_accounts');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS abm_stakeholders (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        account_id INTEGER REFERENCES abm_target_accounts(id) ON DELETE CASCADE,
        full_name VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        role_type VARCHAR(100),
        email VARCHAR(255),
        linkedin_url VARCHAR(500),
        phone VARCHAR(50),
        engagement_level VARCHAR(50) DEFAULT 'cold',
        last_contact_date TIMESTAMP,
        total_touchpoints INTEGER DEFAULT 0,
        interests JSONB,
        pain_points TEXT,
        influence_level VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ abm_stakeholders');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS abm_campaigns (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        campaign_name VARCHAR(500) NOT NULL,
        campaign_type VARCHAR(100),
        status VARCHAR(50) DEFAULT 'draft',
        target_accounts JSONB,
        target_personas JSONB,
        objective TEXT,
        key_message TEXT,
        content_themes JSONB,
        start_date DATE,
        end_date DATE,
        accounts_engaged INTEGER DEFAULT 0,
        stakeholders_engaged INTEGER DEFAULT 0,
        meetings_booked INTEGER DEFAULT 0,
        opportunities_created INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ abm_campaigns');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS abm_touchpoints (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        campaign_id INTEGER REFERENCES abm_campaigns(id) ON DELETE CASCADE,
        account_id INTEGER REFERENCES abm_target_accounts(id) ON DELETE CASCADE,
        stakeholder_id INTEGER REFERENCES abm_stakeholders(id) ON DELETE SET NULL,
        touchpoint_type VARCHAR(100),
        subject VARCHAR(500),
        message TEXT,
        status VARCHAR(50) DEFAULT 'planned',
        scheduled_date TIMESTAMP,
        sent_date TIMESTAMP,
        opened_at TIMESTAMP,
        clicked_at TIMESTAMP,
        responded_at TIMESTAMP,
        response_text TEXT,
        sent_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ abm_touchpoints');

    // 3. STRATEGIC PARTNERS TABLES
    console.log('\n🤝 Creating Strategic Partners tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS strategic_partners (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        partner_type VARCHAR(100) NOT NULL,
        company_name VARCHAR(500) NOT NULL,
        company_domain VARCHAR(255),
        contact_name VARCHAR(255),
        contact_title VARCHAR(255),
        contact_email VARCHAR(255),
        contact_linkedin VARCHAR(500),
        contact_phone VARCHAR(50),
        tier VARCHAR(50) DEFAULT 'prospect',
        focus_area VARCHAR(255),
        geography VARCHAR(255),
        potential_referral_volume VARCHAR(50),
        avg_deal_size VARCHAR(100),
        referral_quality_score INTEGER,
        partnership_status VARCHAR(50) DEFAULT 'prospecting',
        partnership_terms TEXT,
        referral_fee_structure VARCHAR(255),
        last_contact_date TIMESTAMP,
        next_follow_up_date TIMESTAMP,
        total_referrals INTEGER DEFAULT 0,
        total_revenue_generated DECIMAL(12,2) DEFAULT 0,
        why_good_fit TEXT,
        mutual_connections JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ strategic_partners');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS partner_activities (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        partner_id INTEGER REFERENCES strategic_partners(id) ON DELETE CASCADE,
        activity_type VARCHAR(100),
        activity_date TIMESTAMP NOT NULL,
        description TEXT,
        outcome TEXT,
        referral_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
        referral_value DECIMAL(12,2),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✓ partner_activities');

    // 4. CREATE INDEXES
    console.log('\n⚡ Creating performance indexes...');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tl_content_tenant_status ON thought_leadership_content(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_tl_content_publish_date ON thought_leadership_content(publish_date DESC);
      CREATE INDEX IF NOT EXISTS idx_speaking_tenant_date ON speaking_opportunities(tenant_id, event_date DESC);
      CREATE INDEX IF NOT EXISTS idx_abm_accounts_tenant_status ON abm_target_accounts(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_abm_accounts_priority ON abm_target_accounts(tenant_id, priority);
      CREATE INDEX IF NOT EXISTS idx_abm_stakeholders_account ON abm_stakeholders(account_id);
      CREATE INDEX IF NOT EXISTS idx_abm_touchpoints_campaign ON abm_touchpoints(campaign_id, scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_abm_touchpoints_stakeholder ON abm_touchpoints(stakeholder_id);
      CREATE INDEX IF NOT EXISTS idx_partners_tenant_type ON strategic_partners(tenant_id, partner_type);
      CREATE INDEX IF NOT EXISTS idx_partners_tier ON strategic_partners(tenant_id, tier);
      CREATE INDEX IF NOT EXISTS idx_partners_status ON strategic_partners(tenant_id, partnership_status);
      CREATE INDEX IF NOT EXISTS idx_partner_activities_partner ON partner_activities(partner_id, activity_date DESC);
    `);
    console.log('  ✓ All indexes created');

    console.log('\n✅ Database setup complete!\n');
    console.log('Tables created:');
    console.log('  • thought_leadership_content');
    console.log('  • speaking_opportunities');
    console.log('  • thought_leadership_metrics');
    console.log('  • abm_target_accounts');
    console.log('  • abm_stakeholders');
    console.log('  • abm_campaigns');
    console.log('  • abm_touchpoints');
    console.log('  • strategic_partners');
    console.log('  • partner_activities');
    console.log('\n🎉 Ready to use!\n');

  } catch (error) {
    console.error('\n❌ Error setting up database:', error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run setup
setupDatabase();
