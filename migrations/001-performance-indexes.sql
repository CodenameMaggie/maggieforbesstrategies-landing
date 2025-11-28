-- PERFORMANCE OPTIMIZATION: Add critical database indexes
-- Run this script to dramatically improve query performance

-- Contacts table indexes (most frequently queried)
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_stage ON contacts(tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_updated ON contacts(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company) WHERE company IS NOT NULL;

-- Tasks table indexes
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;

-- Contact activities indexes
CREATE INDEX IF NOT EXISTS idx_activities_contact_date ON contact_activities(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_tenant_type ON contact_activities(tenant_id, type);

-- AI conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_bot_updated ON ai_conversations(tenant_id, bot_type, last_message_at DESC);

-- AI memory store indexes
CREATE INDEX IF NOT EXISTS idx_memory_tenant_category_key ON ai_memory_store(tenant_id, category, key);

-- Social posts indexes
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_status ON social_posts(scheduled_for, status) WHERE scheduled_for IS NOT NULL;

-- Success message
SELECT 'All performance indexes created successfully!' as status;
