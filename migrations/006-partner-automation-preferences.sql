-- Migration 006: Partner Automation Preferences
-- Configuration table for Unbound.team partner automation settings

-- Drop existing table if it has wrong schema
DROP TABLE IF EXISTS partner_automation_preferences;

-- Create table with correct schema
CREATE TABLE partner_automation_preferences (
  id SERIAL PRIMARY KEY,
  tenant_slug VARCHAR(255) UNIQUE NOT NULL,
  auto_qualify_leads BOOLEAN DEFAULT true,
  auto_book_calls BOOLEAN DEFAULT true,
  auto_send_proposals BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on tenant_slug for fast lookups
CREATE INDEX idx_partner_automation_tenant ON partner_automation_preferences(tenant_slug);

-- Insert default settings for kristi-empire tenant
INSERT INTO partner_automation_preferences (tenant_slug, auto_qualify_leads, auto_book_calls, auto_send_proposals)
VALUES ('kristi-empire', true, true, true);

-- Add comments
COMMENT ON TABLE partner_automation_preferences IS 'Automation preferences for Unbound.team partner integration';
COMMENT ON COLUMN partner_automation_preferences.auto_qualify_leads IS 'Automatically qualify leads from Unbound';
COMMENT ON COLUMN partner_automation_preferences.auto_book_calls IS 'Automatically book calls for qualified leads';
COMMENT ON COLUMN partner_automation_preferences.auto_send_proposals IS 'Automatically send proposals after calls';
