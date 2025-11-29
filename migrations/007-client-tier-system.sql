-- Migration 007: Client Tier System
-- Adds fields to contacts table for managing consulting clients and Unbound integration

-- ============================================
-- ADD CLIENT MANAGEMENT FIELDS TO CONTACTS
-- ============================================

DO $$
BEGIN
  -- Client tier (strategy, premium, enterprise)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'client_tier'
  ) THEN
    ALTER TABLE contacts
    ADD COLUMN client_tier VARCHAR(50);
  END IF;

  -- Stripe customer ID for billing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE contacts
    ADD COLUMN stripe_customer_id VARCHAR(255);
  END IF;

  -- Unbound.team user ID for AI tools access
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'unbound_user_id'
  ) THEN
    ALTER TABLE contacts
    ADD COLUMN unbound_user_id VARCHAR(255);
  END IF;

  -- Client status (prospect, active, paused, churned)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'client_status'
  ) THEN
    ALTER TABLE contacts
    ADD COLUMN client_status VARCHAR(50) DEFAULT 'prospect';
  END IF;

  -- Track when they became a client
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'client_since'
  ) THEN
    ALTER TABLE contacts
    ADD COLUMN client_since TIMESTAMP;
  END IF;

  -- Monthly recurring revenue
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'mrr'
  ) THEN
    ALTER TABLE contacts
    ADD COLUMN mrr DECIMAL(10,2);
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_client_tier ON contacts(client_tier);
CREATE INDEX IF NOT EXISTS idx_contacts_client_status ON contacts(client_status);
CREATE INDEX IF NOT EXISTS idx_contacts_unbound_user ON contacts(unbound_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_stripe_customer ON contacts(stripe_customer_id);

-- Add comment
COMMENT ON COLUMN contacts.client_tier IS 'Consulting tier: strategy ($2.5k), premium ($5k), enterprise ($10k+)';
COMMENT ON COLUMN contacts.client_status IS 'Client lifecycle status: prospect, active, paused, churned';
COMMENT ON COLUMN contacts.unbound_user_id IS 'Linked Unbound.team user ID for AI tools access';
COMMENT ON COLUMN contacts.mrr IS 'Monthly recurring revenue in USD';
