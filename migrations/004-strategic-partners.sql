-- STRATEGIC PARTNERS
-- Referral partners for high-value client acquisition

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

CREATE INDEX IF NOT EXISTS idx_partners_tenant_type ON strategic_partners(tenant_id, partner_type);
CREATE INDEX IF NOT EXISTS idx_partners_tier ON strategic_partners(tenant_id, tier);
CREATE INDEX IF NOT EXISTS idx_partners_status ON strategic_partners(tenant_id, partnership_status);
CREATE INDEX IF NOT EXISTS idx_partner_activities_partner ON partner_activities(partner_id, activity_date DESC);
