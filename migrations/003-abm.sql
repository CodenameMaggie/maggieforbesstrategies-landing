-- ABM (ACCOUNT-BASED MARKETING)
-- Target enterprise accounts with multi-touch campaigns

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

CREATE INDEX IF NOT EXISTS idx_abm_accounts_tenant_status ON abm_target_accounts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_abm_accounts_priority ON abm_target_accounts(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_abm_stakeholders_account ON abm_stakeholders(account_id);
CREATE INDEX IF NOT EXISTS idx_abm_touchpoints_campaign ON abm_touchpoints(campaign_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_abm_touchpoints_stakeholder ON abm_touchpoints(stakeholder_id);
