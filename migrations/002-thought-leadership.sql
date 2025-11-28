-- THOUGHT LEADERSHIP HUB
-- Content management for enterprise client acquisition

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

CREATE INDEX IF NOT EXISTS idx_tl_content_tenant_status ON thought_leadership_content(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tl_content_publish_date ON thought_leadership_content(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_speaking_tenant_date ON speaking_opportunities(tenant_id, event_date DESC);
