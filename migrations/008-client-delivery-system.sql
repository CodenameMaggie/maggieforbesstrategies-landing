/**
 * CLIENT DELIVERY SYSTEM
 * High-scale multi-tenant agency operating system
 *
 * Features:
 * - Deliverables tracking
 * - Client workspaces
 * - Resource library
 * - Learning loop analytics
 * - Mattermost integration
 * - Automated delivery pipeline
 */

-- Deliverables: Track all work products and their status
CREATE TABLE IF NOT EXISTS client_deliverables (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,

  -- Deliverable details
  deliverable_type VARCHAR(100) NOT NULL, -- 'growth_architecture', 'roadmap', 'training', 'playbook', 'briefing', 'automation'
  title VARCHAR(500) NOT NULL,
  description TEXT,

  -- Status tracking
  status VARCHAR(50) DEFAULT 'planned', -- 'planned', 'in_progress', 'review', 'completed', 'delivered'
  priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'

  -- Timeline
  due_date DATE,
  started_date TIMESTAMP,
  completed_date TIMESTAMP,
  delivered_date TIMESTAMP,

  -- Files and links
  file_url TEXT, -- Google Drive, Dropbox, S3, etc.
  mattermost_channel_id VARCHAR(255), -- Posted to client's Mattermost channel

  -- Assignment
  assigned_to VARCHAR(255), -- Who's working on this
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),

  -- Metadata
  tags TEXT[], -- ['onboarding', 'strategic', 'automation']
  client_tier VARCHAR(50), -- Auto-filled from contact

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_deliverables_contact ON client_deliverables(contact_id);
CREATE INDEX idx_deliverables_status ON client_deliverables(status);
CREATE INDEX idx_deliverables_tenant ON client_deliverables(tenant_id);
CREATE INDEX idx_deliverables_due_date ON client_deliverables(due_date);

-- Client Workspaces: Multi-tenant workspace management
CREATE TABLE IF NOT EXISTS client_workspaces (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,

  -- Workspace details
  workspace_name VARCHAR(255) NOT NULL, -- 'acmecorp', 'techstartup'
  workspace_type VARCHAR(50) DEFAULT 'client', -- 'client', 'internal', 'partner'

  -- Mattermost integration
  mattermost_channel_id VARCHAR(255), -- #clients-acmecorp
  mattermost_channel_name VARCHAR(255),
  mattermost_team_id VARCHAR(255),

  -- Access control
  members JSONB DEFAULT '[]', -- Array of user emails with access
  settings JSONB DEFAULT '{}', -- Workspace-specific settings

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'archived'

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_workspaces_contact ON client_workspaces(contact_id);
CREATE INDEX idx_workspaces_tenant ON client_workspaces(tenant_id);
CREATE INDEX idx_workspaces_mattermost ON client_workspaces(mattermost_channel_id);

-- Resources: Centralized resource library
CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  -- Resource details
  title VARCHAR(500) NOT NULL,
  description TEXT,
  resource_type VARCHAR(50) NOT NULL, -- 'template', 'guide', 'recording', 'playbook', 'training'

  -- Content
  file_url TEXT, -- Direct link to file
  embed_url TEXT, -- Loom, YouTube, etc.
  content TEXT, -- For text-based resources

  -- Access control
  access_level VARCHAR(50) DEFAULT 'all', -- 'all', 'strategy', 'premium', 'enterprise', 'internal'
  category VARCHAR(100), -- 'onboarding', 'growth', 'automation', 'training'

  -- Metadata
  tags TEXT[],
  file_size_mb DECIMAL(10,2),
  duration_minutes INTEGER, -- For videos

  -- Usage tracking
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,

  -- Publishing
  status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published', 'archived'
  published_at TIMESTAMP,

  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_resources_tenant ON resources(tenant_id);
CREATE INDEX idx_resources_access ON resources(access_level);
CREATE INDEX idx_resources_category ON resources(category);
CREATE INDEX idx_resources_status ON resources(status);

-- Learning Metrics: Track what works (win rates, conversion, ROI)
CREATE TABLE IF NOT EXISTS learning_metrics (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,

  -- Metric details
  metric_category VARCHAR(100) NOT NULL, -- 'prospecting', 'sales', 'delivery', 'retention'
  metric_type VARCHAR(100) NOT NULL, -- 'win_rate', 'conversion_rate', 'pipeline_growth', 'churn_rate'

  -- Values
  baseline_value DECIMAL(12,2), -- Before engagement
  current_value DECIMAL(12,2), -- Current state
  target_value DECIMAL(12,2), -- Goal

  -- Context
  measurement_date DATE NOT NULL,
  time_period VARCHAR(50), -- 'weekly', 'monthly', 'quarterly'

  -- Analysis
  improvement_pct DECIMAL(5,2), -- Calculated: (current - baseline) / baseline * 100
  notes TEXT,
  insights JSONB, -- AI-generated insights

  -- Attribution
  attributed_to VARCHAR(255), -- Which deliverable/action caused this

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_learning_metrics_contact ON learning_metrics(contact_id);
CREATE INDEX idx_learning_metrics_category ON learning_metrics(metric_category);
CREATE INDEX idx_learning_metrics_date ON learning_metrics(measurement_date);

-- Delivery Automations: Track automated delivery actions
CREATE TABLE IF NOT EXISTS delivery_automations (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,

  -- Automation details
  automation_type VARCHAR(100) NOT NULL, -- 'post_call_summary', 'deliverable_notification', 'resource_share', 'metric_update'
  trigger_event VARCHAR(100), -- 'call_completed', 'deliverable_completed', 'milestone_reached'

  -- Execution
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  executed_at TIMESTAMP,

  -- Action taken
  action_description TEXT,
  mattermost_posted BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  portal_updated BOOLEAN DEFAULT false,

  -- Results
  result_data JSONB, -- Detailed results
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_delivery_automations_contact ON delivery_automations(contact_id);
CREATE INDEX idx_delivery_automations_status ON delivery_automations(status);
CREATE INDEX idx_delivery_automations_type ON delivery_automations(automation_type);

-- Mattermost Integration: Track channel mappings and posts
CREATE TABLE IF NOT EXISTS mattermost_integrations (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,

  -- Channel mapping
  channel_type VARCHAR(50) NOT NULL, -- 'client_workspace', 'scraping_alerts', 'client_delivery', 'learning_loop', 'billing'
  channel_id VARCHAR(255) NOT NULL,
  channel_name VARCHAR(255) NOT NULL,
  team_id VARCHAR(255),

  -- Association
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE, -- For client workspaces

  -- Settings
  webhook_url TEXT,
  auto_post_enabled BOOLEAN DEFAULT true,

  -- Metadata
  settings JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mattermost_channel ON mattermost_integrations(channel_id);
CREATE INDEX idx_mattermost_contact ON mattermost_integrations(contact_id);
CREATE INDEX idx_mattermost_type ON mattermost_integrations(channel_type);

-- Resource Access Log: Track who accessed what (for analytics)
CREATE TABLE IF NOT EXISTS resource_access_log (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  resource_id INTEGER REFERENCES resources(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,

  access_type VARCHAR(50) NOT NULL, -- 'view', 'download', 'share'
  user_email VARCHAR(255),

  accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_resource_access_resource ON resource_access_log(resource_id);
CREATE INDEX idx_resource_access_contact ON resource_access_log(contact_id);
CREATE INDEX idx_resource_access_date ON resource_access_log(accessed_at);

-- Client Milestones: Track major achievements
CREATE TABLE IF NOT EXISTS client_milestones (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,

  -- Milestone details
  milestone_type VARCHAR(100) NOT NULL, -- 'onboarding_complete', 'first_win', 'roi_achieved', 'expansion'
  title VARCHAR(500) NOT NULL,
  description TEXT,

  -- Impact
  impact_metric VARCHAR(100), -- 'revenue', 'pipeline', 'conversion_rate'
  impact_value DECIMAL(12,2),

  -- Timeline
  achieved_date DATE NOT NULL,

  -- Celebration
  celebrated_in_mattermost BOOLEAN DEFAULT false,
  celebration_post_id VARCHAR(255),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_milestones_contact ON client_milestones(contact_id);
CREATE INDEX idx_milestones_date ON client_milestones(achieved_date);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;
