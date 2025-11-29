const Anthropic = require('@anthropic-ai/sdk');
const db = require('./utils/db');
const emailService = require('./utils/email-service');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * MFS SALES AUTOMATION ENGINE
 * Automatically manages the sales pipeline, follow-ups, and lead nurturing
 */

// Sales stage progression rules
const STAGE_RULES = {
  'new': {
    nextStage: 'qualified',
    autoProgressAfterDays: 1,
    actions: ['qualify_lead', 'assign_to_sarah']
  },
  'qualified': {
    nextStage: 'discovery_call',
    autoProgressAfterDays: 3,
    actions: ['schedule_discovery', 'send_booking_link']
  },
  'discovery_call': {
    nextStage: 'proposal_sent',
    autoProgressAfterDays: 2,
    actions: ['send_thank_you', 'create_proposal_task']
  },
  'proposal_sent': {
    nextStage: 'negotiation',
    autoProgressAfterDays: 5,
    actions: ['follow_up_proposal', 'check_interest']
  },
  'negotiation': {
    nextStage: 'closed_won',
    autoProgressAfterDays: 7,
    actions: ['negotiate_terms', 'send_contract']
  }
};

/**
 * Run sales automation - called by cron job
 */
module.exports = async (req, res) => {
  // CORS headers
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    console.log('[Sales Automation] Starting automation run...');

    const results = {
      leadsQualified: 0,
      followUpsSent: 0,
      stagesProgressed: 0,
      tasksCreated: 0,
      errors: []
    };

    // 1. Qualify new leads
    const newLeads = await db.queryAll(
      `SELECT * FROM contacts WHERE tenant_id = $1 AND stage = 'new' AND created_at < NOW() - INTERVAL '1 day'`,
      [tenantId]
    );

    for (const lead of newLeads) {
      try {
        await qualifyLead(lead, tenantId);
        results.leadsQualified++;
      } catch (error) {
        results.errors.push({ lead: lead.id, error: error.message });
      }
    }

    // 2. Send follow-ups for stale contacts
    const staleContacts = await db.queryAll(
      `SELECT * FROM contacts
       WHERE tenant_id = $1
       AND stage NOT IN ('closed_won', 'closed_lost')
       AND updated_at < NOW() - INTERVAL '3 days'
       ORDER BY updated_at ASC
       LIMIT 10`,
      [tenantId]
    );

    for (const contact of staleContacts) {
      try {
        await sendFollowUp(contact, tenantId);
        results.followUpsSent++;
      } catch (error) {
        results.errors.push({ contact: contact.id, error: error.message });
      }
    }

    // 3. Progress contacts through stages
    for (const [stage, rules] of Object.entries(STAGE_RULES)) {
      const readyToProgress = await db.queryAll(
        `SELECT * FROM contacts
         WHERE tenant_id = $1
         AND stage = $2
         AND updated_at < NOW() - INTERVAL '${rules.autoProgressAfterDays} days'
         LIMIT 5`,
        [tenantId, stage]
      );

      for (const contact of readyToProgress) {
        try {
          await progressStage(contact, rules, tenantId);
          results.stagesProgressed++;
        } catch (error) {
          results.errors.push({ contact: contact.id, error: error.message });
        }
      }
    }

    // 4. Create automated tasks
    const contactsNeedingTasks = await db.queryAll(
      `SELECT c.* FROM contacts c
       LEFT JOIN tasks t ON c.id = t.contact_id AND t.status = 'pending'
       WHERE c.tenant_id = $1
       AND c.stage NOT IN ('closed_won', 'closed_lost')
       AND t.id IS NULL
       LIMIT 10`,
      [tenantId]
    );

    for (const contact of contactsNeedingTasks) {
      try {
        await createAutomatedTask(contact, tenantId);
        results.tasksCreated++;
      } catch (error) {
        results.errors.push({ contact: contact.id, error: error.message });
      }
    }

    console.log('[Sales Automation] Automation complete:', results);

    return res.status(200).json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Sales Automation] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Qualify a new lead using AI
 */
async function qualifyLead(lead, tenantId) {
  console.log(`[Sales Automation] Qualifying lead: ${lead.full_name}`);

  const prompt = `Analyze this lead and determine if they're qualified for Maggie Forbes Strategies (strategic growth consulting for business owners):

Lead: ${lead.full_name}
Email: ${lead.email}
Company: ${lead.company || 'Not provided'}
Source: ${lead.lead_source || 'Unknown'}
Notes: ${lead.notes || 'None'}

Based on this information, is this a qualified lead? Respond with:
1. QUALIFIED or NOT_QUALIFIED
2. Reason (1 sentence)
3. Suggested next action`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const analysis = response.content[0].text;

  if (analysis.includes('QUALIFIED')) {
    await db.query(
      `UPDATE contacts SET stage = 'qualified', updated_at = $1 WHERE id = $2`,
      [new Date(), lead.id]
    );

    await db.insert('contact_activities', {
      tenant_id: tenantId,
      contact_id: lead.id,
      type: 'automated_qualification',
      description: `Lead auto-qualified: ${analysis}`,
      created_at: new Date()
    });
  }
}

/**
 * Send automated follow-up
 */
async function sendFollowUp(contact, tenantId) {
  console.log(`[Sales Automation] Sending follow-up for: ${contact.full_name}`);

  const prompt = `Generate a personalized follow-up message for this contact:

Name: ${contact.full_name}
Stage: ${contact.stage}
Company: ${contact.company || 'Not provided'}
Last updated: ${contact.updated_at}

Write a brief, professional follow-up message (2-3 sentences) to re-engage them.`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  const message = response.content[0].text;

  // Actually send the email
  const emailResult = await emailService.sendFollowUpEmail(contact, message);

  await db.insert('contact_activities', {
    tenant_id: tenantId,
    contact_id: contact.id,
    type: 'automated_follow_up',
    description: `Auto follow-up sent: ${message}${emailResult.success ? ' (Email delivered)' : ' (Email failed)'}`,
    created_at: new Date()
  });

  await db.insert('tasks', {
    tenant_id: tenantId,
    title: `Follow up with ${contact.full_name}`,
    description: `Automated follow-up: ${message}`,
    contact_id: contact.id,
    priority: 'medium',
    status: 'pending',
    source: 'sales_automation',
    created_at: new Date()
  });

  await db.query(
    `UPDATE contacts SET updated_at = $1 WHERE id = $2`,
    [new Date(), contact.id]
  );
}

/**
 * Progress contact to next stage
 */
async function progressStage(contact, rules, tenantId) {
  console.log(`[Sales Automation] Progressing ${contact.full_name} from ${contact.stage} to ${rules.nextStage}`);

  await db.query(
    `UPDATE contacts SET stage = $1, updated_at = $2 WHERE id = $3`,
    [rules.nextStage, new Date(), contact.id]
  );

  await db.insert('contact_activities', {
    tenant_id: tenantId,
    contact_id: contact.id,
    type: 'stage_progression',
    description: `Auto-progressed from ${contact.stage} to ${rules.nextStage}`,
    created_at: new Date()
  });

  // Execute stage-specific actions
  for (const action of rules.actions) {
    await executeAction(action, contact, tenantId);
  }
}

/**
 * Create automated task
 */
async function createAutomatedTask(contact, tenantId) {
  const taskDescriptions = {
    'new': `Qualify and reach out to ${contact.full_name}`,
    'qualified': `Send discovery call booking link to ${contact.full_name}`,
    'discovery_call': `Follow up with ${contact.full_name} after discovery call`,
    'proposal_sent': `Check if ${contact.full_name} has questions about proposal`,
    'negotiation': `Continue negotiations with ${contact.full_name}`
  };

  const task = await db.insert('tasks', {
    tenant_id: tenantId,
    title: taskDescriptions[contact.stage] || `Follow up with ${contact.full_name}`,
    description: `Automated task for ${contact.stage} stage`,
    contact_id: contact.id,
    priority: 'medium',
    status: 'pending',
    due_date_text: 'within 2 days',
    source: 'sales_automation',
    created_at: new Date()
  });

  console.log(`[Sales Automation] Created task ${task.id} for ${contact.full_name}`);
}

/**
 * Execute stage-specific action
 */
async function executeAction(action, contact, tenantId) {
  const actions = {
    'send_booking_link': async () => {
      const emailResult = await emailService.sendBookingLink(contact);
      await db.insert('contact_activities', {
        tenant_id: tenantId,
        contact_id: contact.id,
        type: 'booking_link_sent',
        description: `Calendly booking link sent: https://calendly.com/maggie-maggieforbesstrategies/discovery-call${emailResult.success ? ' (Email delivered)' : ' (Email failed)'}`,
        created_at: new Date()
      });
    },
    'send_thank_you': async () => {
      const emailResult = await emailService.sendThankYouEmail(contact);
      await db.insert('contact_activities', {
        tenant_id: tenantId,
        contact_id: contact.id,
        type: 'thank_you_sent',
        description: `Thank you message sent after discovery call${emailResult.success ? ' (Email delivered)' : ' (Email failed)'}`,
        created_at: new Date()
      });
    },
    'follow_up_proposal': async () => {
      const emailResult = await emailService.sendProposalFollowUp(contact);
      await db.insert('contact_activities', {
        tenant_id: tenantId,
        contact_id: contact.id,
        type: 'proposal_follow_up',
        description: `Proposal follow-up sent${emailResult.success ? ' (Email delivered)' : ' (Email failed)'}`,
        created_at: new Date()
      });
    }
  };

  if (actions[action]) {
    await actions[action]();
  }
}
