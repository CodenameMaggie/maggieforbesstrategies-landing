-- THOUGHT LEADERSHIP HUB, ABM CAMPAIGNS & STRATEGIC PARTNER PROSPECTING
-- High-end client acquisition features for enterprise consulting

-- ============================================================================
-- 1. THOUGHT LEADERSHIP HUB
-- ============================================================================

-- Content pieces (articles, whitepapers, reports, videos)
CREATE TABLE IF NOT EXISTS thought_leadership_content (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  -- Content details
  title VARCHAR(500) NOT NULL,
  content_type VARCHAR(50) NOT NULL, -- article, whitepaper, case_study, report, video, podcast
  status VARCHAR(50) DEFAULT 'draft', -- draft, in_review, scheduled, published

  -- Content body
  summary TEXT,
  body TEXT,
  key_insights JSONB, -- Array of key takeaways

  -- Publishing
  publish_date TIMESTAMP,
  platforms JSONB, -- {linkedin: {url, published_at}, medium: {url}, etc}

  -- SEO & targeting
  target_audience VARCHAR(255), -- C-suite, PE firms, CFOs, etc
  industry_focus VARCHAR(255),
  keywords TEXT[],

  -- Engagement metrics
  views INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,

  -- Attribution
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP
);

-- Speaking opportunities & events
CREATE TABLE IF NOT EXISTS speaking_opportunities (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  -- Event details
  event_name VARCHAR(500) NOT NULL,
  event_type VARCHAR(100), -- conference, webinar, podcast, roundtable, workshop
  event_date TIMESTAMP,
  event_url VARCHAR(1000),

  -- Opportunity details
  status VARCHAR(50) DEFAULT 'prospect', -- prospect, applied, accepted, completed, declined
  topic VARCHAR(500),
  audience_size INTEGER,
  audience_type VARCHAR(255), -- C-suite, PE firms, industry-specific

  -- Contact info
  organizer_name VARCHAR(255),
  organizer_email VARCHAR(255),
  organizer_company VARCHAR(255),

  -- Outcome tracking
  leads_generated INTEGER DEFAULT 0,
  follow_up_meetings INTEGER DEFAULT 0,

  -- Notes
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Thought leadership metrics & ROI tracking
CREATE TABLE IF NOT EXISTS thought_leadership_metrics (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  content_id INTEGER REFERENCES thought_leadership_content(id),

  metric_date DATE NOT NULL,
  metric_type VARCHAR(100), -- views, shares, leads, meetings_booked
  metric_value INTEGER DEFAULT 0,
  source VARCHAR(100), -- linkedin, medium, website, etc

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 2. ABM (ACCOUNT-BASED MARKETING) CAMPAIGN MANAGER
-- ============================================================================

-- Target accounts (enterprise companies you want to land)
CREATE TABLE IF NOT EXISTS abm_target_accounts (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  -- Company details
  company_name VARCHAR(500) NOT NULL,
  company_domain VARCHAR(255),
  industry VARCHAR(255),
  company_size VARCHAR(100), -- employees: 500-1000, 1000-5000, 5000+
  annual_revenue VARCHAR(100), -- $50M-$100M, $100M-$500M, $500M+

  -- Account status
  status VARCHAR(50) DEFAULT 'prospecting', -- prospecting, engaged, qualified, proposal, closed_won, closed_lost
  priority VARCHAR(50) DEFAULT 'medium', -- high, medium, low

  -- Account value
  estimated_deal_value DECIMAL(12,2),
  strategic_importance VARCHAR(50), -- critical, high, medium, low

  -- Pain points & fit
  pain_points TEXT,
  our_fit_score INTEGER, -- 1-100
  buying_signals JSONB, -- Array of signals: funding, hiring, expansion, etc

  -- Account intelligence
  decision_making_process TEXT,
  budget_cycle VARCHAR(100),
  competitors JSONB, -- Array of competitor names

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  first_contact_date TIMESTAMP,
  last_activity_date TIMESTAMP
);

-- Stakeholders within target accounts
CREATE TABLE IF NOT EXISTS abm_stakeholders (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  account_id INTEGER REFERENCES abm_target_accounts(id) ON DELETE CASCADE,

  -- Person details
  full_name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  role_type VARCHAR(100), -- decision_maker, influencer, champion, gatekeeper
  email VARCHAR(255),
  linkedin_url VARCHAR(500),
  phone VARCHAR(50),

  -- Engagement
  engagement_level VARCHAR(50) DEFAULT 'cold', -- cold, warm, hot, champion
  last_contact_date TIMESTAMP,
  total_touchpoints INTEGER DEFAULT 0,

  -- Intelligence
  interests JSONB, -- Array of topics they care about
  pain_points TEXT,
  influence_level VARCHAR(50), -- high, medium, low

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ABM campaigns (coordinated multi-touch outreach)
CREATE TABLE IF NOT EXISTS abm_campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  -- Campaign details
  campaign_name VARCHAR(500) NOT NULL,
  campaign_type VARCHAR(100), -- content_series, event_based, trigger_based, always_on
  status VARCHAR(50) DEFAULT 'draft', -- draft, active, paused, completed

  -- Targeting
  target_accounts JSONB, -- Array of account IDs
  target_personas JSONB, -- Array of role types

  -- Campaign strategy
  objective TEXT,
  key_message TEXT,
  content_themes JSONB, -- Array of content topics

  -- Timeline
  start_date DATE,
  end_date DATE,

  -- Performance
  accounts_engaged INTEGER DEFAULT 0,
  stakeholders_engaged INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  opportunities_created INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Campaign touchpoints (individual outreach activities)
CREATE TABLE IF NOT EXISTS abm_touchpoints (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  campaign_id INTEGER REFERENCES abm_campaigns(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES abm_target_accounts(id) ON DELETE CASCADE,
  stakeholder_id INTEGER REFERENCES abm_stakeholders(id) ON DELETE SET NULL,

  -- Touchpoint details
  touchpoint_type VARCHAR(100), -- email, linkedin_message, direct_mail, phone_call, meeting, content_share
  subject VARCHAR(500),
  message TEXT,

  -- Execution
  status VARCHAR(50) DEFAULT 'planned', -- planned, sent, delivered, opened, clicked, responded, failed
  scheduled_date TIMESTAMP,
  sent_date TIMESTAMP,

  -- Engagement
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  responded_at TIMESTAMP,
  response_text TEXT,

  -- Attribution
  sent_by VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- 3. STRATEGIC PARTNER PROSPECTOR
-- ============================================================================

-- Strategic partners (referral sources, co-marketing partners)
CREATE TABLE IF NOT EXISTS strategic_partners (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  -- Partner details
  partner_type VARCHAR(100) NOT NULL, -- pe_firm, conference_organizer, complementary_consultant, cpa_firm, law_firm, industry_association
  company_name VARCHAR(500) NOT NULL,
  company_domain VARCHAR(255),

  -- Contact person
  contact_name VARCHAR(255),
  contact_title VARCHAR(255),
  contact_email VARCHAR(255),
  contact_linkedin VARCHAR(500),
  contact_phone VARCHAR(50),

  -- Partner classification
  tier VARCHAR(50) DEFAULT 'prospect', -- prospect, active, strategic, inactive
  focus_area VARCHAR(255), -- PE buyouts, tech conferences, CFO services, etc
  geography VARCHAR(255),

  -- Partner value
  potential_referral_volume VARCHAR(50), -- 1-5/year, 5-10/year, 10+/year
  avg_deal_size VARCHAR(100),
  referral_quality_score INTEGER, -- 1-100

  -- Partnership details
  partnership_status VARCHAR(50) DEFAULT 'prospecting', -- prospecting, initial_contact, discussing, active, paused
  partnership_terms TEXT,
  referral_fee_structure VARCHAR(255),

  -- Activity tracking
  last_contact_date TIMESTAMP,
  next_follow_up_date TIMESTAMP,
  total_referrals INTEGER DEFAULT 0,
  total_revenue_generated DECIMAL(12,2) DEFAULT 0,

  -- Intelligence
  why_good_fit TEXT,
  mutual_connections JSONB,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Partner activities & interactions
CREATE TABLE IF NOT EXISTS partner_activities (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  partner_id INTEGER REFERENCES strategic_partners(id) ON DELETE CASCADE,

  activity_type VARCHAR(100), -- outreach, meeting, referral_received, co_marketing, event
  activity_date TIMESTAMP NOT NULL,
  description TEXT,
  outcome TEXT,

  -- If it's a referral
  referral_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  referral_value DECIMAL(12,2),

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Thought Leadership
CREATE INDEX IF NOT EXISTS idx_tl_content_tenant_status ON thought_leadership_content(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tl_content_publish_date ON thought_leadership_content(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_speaking_tenant_date ON speaking_opportunities(tenant_id, event_date DESC);

-- ABM
CREATE INDEX IF NOT EXISTS idx_abm_accounts_tenant_status ON abm_target_accounts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_abm_accounts_priority ON abm_target_accounts(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_abm_stakeholders_account ON abm_stakeholders(account_id);
CREATE INDEX IF NOT EXISTS idx_abm_touchpoints_campaign ON abm_touchpoints(campaign_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_abm_touchpoints_stakeholder ON abm_touchpoints(stakeholder_id);

-- Strategic Partners
CREATE INDEX IF NOT EXISTS idx_partners_tenant_type ON strategic_partners(tenant_id, partner_type);
CREATE INDEX IF NOT EXISTS idx_partners_tier ON strategic_partners(tenant_id, tier);
CREATE INDEX IF NOT EXISTS idx_partners_status ON strategic_partners(tenant_id, partnership_status);
CREATE INDEX IF NOT EXISTS idx_partner_activities_partner ON partner_activities(partner_id, activity_date DESC);
