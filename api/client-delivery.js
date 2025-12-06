const db = require('./utils/db');

/**
 * CLIENT DELIVERY AUTOMATION
 * High-scale delivery pipeline that automates everything
 *
 * Features:
 * - Auto-create deliverables based on tier
 * - Track delivery status
 * - Post to Mattermost when completed
 * - Send client notifications
 * - Update learning metrics
 */

module.exports = async (req, res) => {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'https://maggieforbesstrategies.com',
    'https://www.maggieforbesstrategies.com',
    'http://localhost:3000'
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    if (req.method === 'GET') {
      const { contactId, status, deliverableType } = req.query;

      // Get deliverables with filters
      let query = 'SELECT * FROM client_deliverables WHERE tenant_id = $1';
      const params = [tenantId];

      if (contactId) {
        params.push(contactId);
        query += ` AND contact_id = $${params.length}`;
      }

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      if (deliverableType) {
        params.push(deliverableType);
        query += ` AND deliverable_type = $${params.length}`;
      }

      query += ' ORDER BY due_date ASC, priority DESC';

      const deliverables = await db.query(query, params);

      return res.status(200).json({
        success: true,
        deliverables
      });
    }

    if (req.method === 'POST') {
      const { action, data } = req.body;

      switch (action) {
        case 'create_deliverable':
          return await createDeliverable(data, tenantId, res);

        case 'update_status':
          return await updateDeliverableStatus(data, tenantId, res);

        case 'auto_create_for_client':
          return await autoCreateDeliverables(data.contactId, tenantId, res);

        case 'complete_deliverable':
          return await completeDeliverable(data, tenantId, res);

        case 'trigger_post_call':
          return await triggerPostCallAutomation(data, tenantId, res);

        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    }

    if (req.method === 'PUT') {
      const { deliverableId, updates } = req.body;

      const allowedFields = [
        'title', 'description', 'status', 'priority', 'due_date',
        'file_url', 'assigned_to', 'actual_hours'
      ];

      const setClauses = [];
      const params = [tenantId, deliverableId];
      let paramIndex = 3;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      setClauses.push(`updated_at = NOW()`);

      const query = `
        UPDATE client_deliverables
        SET ${setClauses.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;

      const result = await db.queryOne(query, params);

      return res.status(200).json({
        success: true,
        deliverable: result
      });
    }

    if (req.method === 'DELETE') {
      const { deliverableId } = req.query;

      await db.query(
        'DELETE FROM client_deliverables WHERE id = $1 AND tenant_id = $2',
        [deliverableId, tenantId]
      );

      return res.status(200).json({
        success: true,
        message: 'Deliverable deleted'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Client Delivery] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Create a new deliverable
 */
async function createDeliverable(data, tenantId, res) {
  const {
    contactId, deliverableType, title, description,
    dueDate, priority, assignedTo, estimatedHours
  } = data;

  if (!contactId || !deliverableType || !title) {
    return res.status(400).json({
      error: 'Missing required fields: contactId, deliverableType, title'
    });
  }

  // Get client tier
  const contact = await db.queryOne(
    'SELECT client_tier FROM contacts WHERE id = $1 AND tenant_id = $2',
    [contactId, tenantId]
  );

  const deliverable = await db.insert('client_deliverables', {
    tenant_id: tenantId,
    contact_id: contactId,
    deliverable_type: deliverableType,
    title,
    description,
    due_date: dueDate,
    priority: priority || 'medium',
    assigned_to: assignedTo,
    estimated_hours: estimatedHours,
    client_tier: contact?.client_tier,
    status: 'planned',
    created_at: new Date(),
    updated_at: new Date()
  });

  // Log automation
  await db.insert('delivery_automations', {
    tenant_id: tenantId,
    contact_id: contactId,
    automation_type: 'deliverable_created',
    trigger_event: 'manual_creation',
    status: 'completed',
    action_description: `Created deliverable: ${title}`,
    executed_at: new Date(),
    created_at: new Date()
  });

  return res.status(200).json({
    success: true,
    deliverable
  });
}

/**
 * Update deliverable status with automation triggers
 */
async function updateDeliverableStatus(data, tenantId, res) {
  const { deliverableId, status } = data;

  const deliverable = await db.queryOne(
    'SELECT * FROM client_deliverables WHERE id = $1 AND tenant_id = $2',
    [deliverableId, tenantId]
  );

  if (!deliverable) {
    return res.status(404).json({ error: 'Deliverable not found' });
  }

  const updates = { status, updated_at: new Date() };

  // Track status-specific timestamps
  if (status === 'in_progress' && !deliverable.started_date) {
    updates.started_date = new Date();
  } else if (status === 'completed' && !deliverable.completed_date) {
    updates.completed_date = new Date();
  } else if (status === 'delivered' && !deliverable.delivered_date) {
    updates.delivered_date = new Date();
  }

  const updated = await db.queryOne(
    `UPDATE client_deliverables
     SET status = $1, started_date = $2, completed_date = $3, delivered_date = $4, updated_at = $5
     WHERE id = $6 AND tenant_id = $7
     RETURNING *`,
    [
      updates.status,
      updates.started_date || deliverable.started_date,
      updates.completed_date || deliverable.completed_date,
      updates.delivered_date || deliverable.delivered_date,
      updates.updated_at,
      deliverableId,
      tenantId
    ]
  );

  // Trigger automations based on status change
  if (status === 'completed') {
    await triggerDeliverableCompletedAutomation(updated, tenantId);
  } else if (status === 'delivered') {
    await triggerDeliverableDeliveredAutomation(updated, tenantId);
  }

  return res.status(200).json({
    success: true,
    deliverable: updated
  });
}

/**
 * Auto-create deliverables based on client tier
 */
async function autoCreateDeliverables(contactId, tenantId, res) {
  const contact = await db.queryOne(
    'SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2',
    [contactId, tenantId]
  );

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const tier = contact.client_tier || 'strategy';
  const deliverablesToCreate = getDeliverablesByTier(tier, contact);

  const created = [];

  for (const deliverable of deliverablesToCreate) {
    const result = await db.insert('client_deliverables', {
      tenant_id: tenantId,
      contact_id: contactId,
      ...deliverable,
      client_tier: tier,
      created_at: new Date(),
      updated_at: new Date()
    });

    created.push(result);
  }

  // Log automation
  await db.insert('delivery_automations', {
    tenant_id: tenantId,
    contact_id: contactId,
    automation_type: 'auto_create_deliverables',
    trigger_event: 'client_provisioned',
    status: 'completed',
    action_description: `Auto-created ${created.length} deliverables for ${tier} tier client`,
    result_data: { deliverable_ids: created.map(d => d.id) },
    executed_at: new Date(),
    created_at: new Date()
  });

  return res.status(200).json({
    success: true,
    message: `Created ${created.length} deliverables`,
    deliverables: created
  });
}

/**
 * Get tier-specific deliverables
 */
function getDeliverablesByTier(tier, contact) {
  const companyName = contact.company || contact.full_name;
  const today = new Date();

  const baseDeliverables = [
    {
      deliverable_type: 'onboarding',
      title: 'Welcome Package & Onboarding Call',
      description: 'Initial onboarding session, expectations setting, and platform access',
      status: 'planned',
      priority: 'high',
      due_date: addDays(today, 3),
      estimated_hours: 2
    },
    {
      deliverable_type: 'growth_architecture',
      title: `Growth Architecture Document - ${companyName}`,
      description: 'Complete strategic growth architecture framework tailored to company',
      status: 'planned',
      priority: 'high',
      due_date: addDays(today, 14),
      estimated_hours: 8
    },
    {
      deliverable_type: 'roadmap',
      title: 'Q1 Strategic Roadmap',
      description: 'Quarterly strategic roadmap with milestones and KPIs',
      status: 'planned',
      priority: 'medium',
      due_date: addDays(today, 21),
      estimated_hours: 4
    },
    {
      deliverable_type: 'roadmap',
      title: 'Q2 Strategic Roadmap',
      description: 'Quarterly strategic roadmap with milestones and KPIs',
      status: 'planned',
      priority: 'medium',
      due_date: addDays(today, 90),
      estimated_hours: 4
    }
  ];

  if (tier === 'premium' || tier === 'enterprise') {
    baseDeliverables.push(
      {
        deliverable_type: 'training',
        title: 'AI Tools Training & Setup',
        description: 'Complete training on Growth Manager Pro AI tools and initial setup',
        status: 'planned',
        priority: 'high',
        due_date: addDays(today, 7),
        estimated_hours: 3
      },
      {
        deliverable_type: 'playbook',
        title: 'Automation Playbook',
        description: 'Custom automation playbook for pipeline and lead generation',
        status: 'planned',
        priority: 'medium',
        due_date: addDays(today, 30),
        estimated_hours: 6
      }
    );
  }

  if (tier === 'enterprise') {
    baseDeliverables.push(
      {
        deliverable_type: 'automation',
        title: 'Complete Operational Automation Setup',
        description: 'Done-for-you implementation of all operational automations',
        status: 'planned',
        priority: 'high',
        due_date: addDays(today, 45),
        estimated_hours: 20
      },
      {
        deliverable_type: 'briefing',
        title: 'Monthly Executive Briefing - Month 1',
        description: 'Executive-level briefing with metrics, insights, and strategic recommendations',
        status: 'planned',
        priority: 'medium',
        due_date: addDays(today, 30),
        estimated_hours: 3
      }
    );
  }

  return baseDeliverables;
}

/**
 * Complete a deliverable (marks complete and triggers notifications)
 */
async function completeDeliverable(data, tenantId, res) {
  const { deliverableId, fileUrl, actualHours, notes } = data;

  const deliverable = await db.queryOne(
    `UPDATE client_deliverables
     SET status = 'completed',
         completed_date = NOW(),
         file_url = $1,
         actual_hours = $2,
         description = CONCAT(description, $3),
         updated_at = NOW()
     WHERE id = $4 AND tenant_id = $5
     RETURNING *`,
    [
      fileUrl,
      actualHours,
      notes ? `\n\nCompletion Notes: ${notes}` : '',
      deliverableId,
      tenantId
    ]
  );

  if (!deliverable) {
    return res.status(404).json({ error: 'Deliverable not found' });
  }

  // Trigger completion automation
  await triggerDeliverableCompletedAutomation(deliverable, tenantId);

  return res.status(200).json({
    success: true,
    deliverable
  });
}

/**
 * Trigger post-call automation
 */
async function triggerPostCallAutomation(data, tenantId, res) {
  const { callId, contactId, notes, actionItems, nextSteps } = data;

  // Create deliverables from action items
  if (actionItems && actionItems.length > 0) {
    for (const item of actionItems) {
      await db.insert('client_deliverables', {
        tenant_id: tenantId,
        contact_id: contactId,
        deliverable_type: 'action_item',
        title: item.title || item,
        description: item.description || '',
        status: 'planned',
        priority: 'high',
        due_date: addDays(new Date(), 7),
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  // Log automation
  await db.insert('delivery_automations', {
    tenant_id: tenantId,
    contact_id: contactId,
    automation_type: 'post_call_summary',
    trigger_event: 'call_completed',
    status: 'completed',
    action_description: `Post-call automation: ${actionItems?.length || 0} action items created`,
    result_data: { call_id: callId, notes, action_items: actionItems, next_steps: nextSteps },
    mattermost_posted: false, // Will be posted by Mattermost integration
    executed_at: new Date(),
    created_at: new Date()
  });

  return res.status(200).json({
    success: true,
    message: 'Post-call automation completed',
    actionItemsCreated: actionItems?.length || 0
  });
}

/**
 * Trigger automation when deliverable is completed
 */
async function triggerDeliverableCompletedAutomation(deliverable, tenantId) {
  // Log automation
  await db.insert('delivery_automations', {
    tenant_id: tenantId,
    contact_id: deliverable.contact_id,
    automation_type: 'deliverable_completed',
    trigger_event: 'status_change',
    status: 'completed',
    action_description: `Deliverable completed: ${deliverable.title}`,
    result_data: { deliverable_id: deliverable.id },
    mattermost_posted: false, // Will be posted by Mattermost webhook
    portal_updated: true,
    executed_at: new Date(),
    created_at: new Date()
  });

  // TODO: Post to Mattermost client channel
  // TODO: Send email notification
  // TODO: Update learning metrics
}

/**
 * Trigger automation when deliverable is delivered
 */
async function triggerDeliverableDeliveredAutomation(deliverable, tenantId) {
  // Log automation
  await db.insert('delivery_automations', {
    tenant_id: tenantId,
    contact_id: deliverable.contact_id,
    automation_type: 'deliverable_delivered',
    trigger_event: 'status_change',
    status: 'completed',
    action_description: `Deliverable delivered to client: ${deliverable.title}`,
    result_data: { deliverable_id: deliverable.id, file_url: deliverable.file_url },
    mattermost_posted: false,
    portal_updated: true,
    executed_at: new Date(),
    created_at: new Date()
  });

  // TODO: Celebrate milestone in Mattermost
  // TODO: Request client feedback
}

/**
 * Helper: Add days to date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
