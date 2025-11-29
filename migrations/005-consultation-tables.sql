-- Migration 005: Consultation Call Tables
-- Creates tables for tracking discovery calls, consultation calls, and strategy calls

-- ============================================
-- CONSULTATION CALLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS consultation_calls (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP NOT NULL,
  meeting_link TEXT,
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consultation_calls_tenant ON consultation_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consultation_calls_contact ON consultation_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_consultation_calls_scheduled ON consultation_calls(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_consultation_calls_status ON consultation_calls(status);

-- ============================================
-- DISCOVERY CALLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS discovery_calls (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP NOT NULL,
  meeting_link TEXT,
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  notes TEXT,
  key_insights TEXT,
  qualification_score INTEGER, -- 1-10 rating
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_calls_tenant ON discovery_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_discovery_calls_contact ON discovery_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_discovery_calls_scheduled ON discovery_calls(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_discovery_calls_status ON discovery_calls(status);

-- ============================================
-- STRATEGY CALLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS strategy_calls (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP NOT NULL,
  meeting_link TEXT,
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  notes TEXT,
  action_items TEXT,
  next_steps TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_strategy_calls_tenant ON strategy_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_strategy_calls_contact ON strategy_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_strategy_calls_scheduled ON strategy_calls(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_strategy_calls_status ON strategy_calls(status);

-- ============================================
-- ADD BOOKING RESPONSE STATUS TO CONTACTS
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'booking_response_status'
  ) THEN
    ALTER TABLE contacts
    ADD COLUMN booking_response_status VARCHAR(50);
  END IF;
END $$;

COMMENT ON TABLE consultation_calls IS 'Tracks general consultation calls with prospects';
COMMENT ON TABLE discovery_calls IS 'Tracks discovery calls - initial qualification meetings';
COMMENT ON TABLE strategy_calls IS 'Tracks strategy calls - deeper engagement sessions';
