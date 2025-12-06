const db = require('./utils/db');
const emailService = require('./utils/email-service');

/**
 * PROVISION CLIENT FOR UNBOUND AI TOOLS
 *
 * When a contact becomes a Premium or Enterprise client,
 * this provisions them in Unbound.team for unlimited AI tools access
 */

const UNBOUND_API_KEY = process.env.UNBOUND_API_KEY;
const UNBOUND_BASE_URL = process.env.UNBOUND_BASE_URL || 'https://api.unbound.team';
const TENANT_SLUG = process.env.UNBOUND_TENANT_SLUG || 'kristi-empire';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantId = process.env.MFS_TENANT_ID || '00000000-0000-0000-0000-000000000001';
  const { contactId, tier } = req.body;

  if (!contactId || !tier) {
    return res.status(400).json({
      error: 'Missing required fields: contactId, tier'
    });
  }

  if (!['strategy', 'premium', 'enterprise'].includes(tier)) {
    return res.status(400).json({
      error: 'Invalid tier. Must be: strategy, premium, or enterprise'
    });
  }

  try {
    console.log(`[Provision Client] Starting provisioning for contact ${contactId} as ${tier}`);

    // Step 1: Get contact details
    const contact = await db.queryOne(
      `SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2`,
      [contactId, tenantId]
    );

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contact.email) {
      return res.status(400).json({ error: 'Contact must have an email address' });
    }

    // Step 2: Calculate MRR based on tier (annual contract / 12 months)
    // Contract prices: Strategy $25K, Premium $50K, Enterprise $150K
    const tierPricing = {
      'strategy': 2083.33,   // $25,000 annual contract / 12 months
      'premium': 4166.67,    // $50,000 annual contract / 12 months
      'enterprise': 12500    // $150,000 annual contract / 12 months
    };
    const mrr = tierPricing[tier];

    // Step 3: Provision in Unbound.team (if Premium or Enterprise)
    let unboundUserId = null;
    if (['premium', 'enterprise'].includes(tier) && UNBOUND_API_KEY) {
      try {
        console.log(`[Provision Client] Provisioning ${contact.email} in Unbound.team`);

        const unboundResponse = await fetch(
          `${UNBOUND_BASE_URL}/api/partner/${TENANT_SLUG}/provision-client`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${UNBOUND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userEmail: contact.email,
              userName: contact.full_name || contact.email,
              plan: 'premium', // Always premium for unlimited access
              source: 'maggie-forbes',
              brand: 'maggie-forbes',
              consultingTier: tier
            })
          }
        );

        if (unboundResponse.ok) {
          const data = await unboundResponse.json();
          unboundUserId = data.userId;
          console.log(`[Provision Client] Unbound user created: ${unboundUserId}`);
        } else {
          const error = await unboundResponse.text();
          console.error(`[Provision Client] Unbound API error:`, error);
        }
      } catch (unboundError) {
        console.error(`[Provision Client] Unbound provisioning failed:`, unboundError);
        // Continue anyway - we can provision later
      }
    } else if (!UNBOUND_API_KEY) {
      console.warn('[Provision Client] No UNBOUND_API_KEY configured - skipping Unbound provisioning');
    }

    // Step 4: Update contact in database
    await db.query(
      `UPDATE contacts
       SET client_tier = $1,
           client_status = 'active',
           client_since = COALESCE(client_since, $2),
           mrr = $3,
           unbound_user_id = $4,
           stage = 'closed_won',
           updated_at = $5
       WHERE id = $6`,
      [tier, new Date(), mrr, unboundUserId, new Date(), contactId]
    );

    console.log(`[Provision Client] Contact updated with tier: ${tier}`);

    // Step 5: Log activity
    await db.insert('contact_activities', {
      tenant_id: tenantId,
      contact_id: contactId,
      type: 'client_provisioned',
      description: `Provisioned as ${tier} client. MRR: $${mrr}${unboundUserId ? `. Unbound ID: ${unboundUserId}` : ''}`,
      created_at: new Date()
    });

    // Step 6: Create onboarding tasks
    const onboardingTasks = [];

    if (tier === 'strategy') {
      onboardingTasks.push({
        title: `Schedule first strategy call with ${contact.full_name}`,
        description: 'Send Calendly link for initial strategy session',
        priority: 'high',
        due_date_text: 'This week'
      });
      onboardingTasks.push({
        title: `Send Slack invite to ${contact.full_name}`,
        description: 'Add to private Slack channel for direct messaging',
        priority: 'high',
        due_date_text: 'Today'
      });
    }

    if (tier === 'premium') {
      onboardingTasks.push({
        title: `Schedule first strategy call with ${contact.full_name}`,
        description: 'Send Calendly link for bi-weekly strategy sessions',
        priority: 'high',
        due_date_text: 'This week'
      });
      onboardingTasks.push({
        title: `Send Slack invite to ${contact.full_name}`,
        description: 'Add to private Slack channel',
        priority: 'high',
        due_date_text: 'Today'
      });
      onboardingTasks.push({
        title: `Send AI Tools access to ${contact.full_name}`,
        description: `Email Growth Manager Pro login: https://app.growthmangerpro.com\nUnbound User ID: ${unboundUserId || 'Pending'}`,
        priority: 'high',
        due_date_text: 'Today'
      });
    }

    if (tier === 'enterprise') {
      onboardingTasks.push({
        title: `Schedule first strategy call with ${contact.full_name}`,
        description: 'Send Calendly link for weekly strategy sessions',
        priority: 'high',
        due_date_text: 'This week'
      });
      onboardingTasks.push({
        title: `Send Slack invite to ${contact.full_name}`,
        description: 'Add to private Slack channel with white-glove support',
        priority: 'high',
        due_date_text: 'Today'
      });
      onboardingTasks.push({
        title: `Send AI Tools access to ${contact.full_name}`,
        description: `Email Growth Manager Pro login + offer done-for-you service\nUnbound User ID: ${unboundUserId || 'Pending'}`,
        priority: 'high',
        due_date_text: 'Today'
      });
      onboardingTasks.push({
        title: `Assign dedicated account manager to ${contact.full_name}`,
        description: 'Enterprise white-glove service setup',
        priority: 'high',
        due_date_text: 'This week'
      });
    }

    // Create all onboarding tasks
    for (const task of onboardingTasks) {
      await db.insert('tasks', {
        tenant_id: tenantId,
        contact_id: contactId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: 'pending',
        due_date_text: task.due_date_text,
        source: 'client_provisioning',
        created_at: new Date()
      });
    }

    console.log(`[Provision Client] Created ${onboardingTasks.length} onboarding tasks`);

    // Step 7: Send welcome email
    // Note: You can customize this in email-service.js or create a new template
    console.log(`[Provision Client] Welcome email should be sent to ${contact.email}`);

    return res.status(200).json({
      success: true,
      message: `Client provisioned successfully as ${tier}`,
      contactId: contactId,
      tier: tier,
      mrr: mrr,
      unboundUserId: unboundUserId,
      tasksCreated: onboardingTasks.length,
      hasToolsAccess: ['premium', 'enterprise'].includes(tier)
    });

  } catch (error) {
    console.error('[Provision Client] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to provision client',
      details: error.message
    });
  }
};
