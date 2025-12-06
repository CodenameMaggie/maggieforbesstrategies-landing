const db = require('./utils/db');

/**
 * CLIENT PORTAL API
 * Provides authenticated clients with their data:
 * - Upcoming strategy calls
 * - Past session notes
 * - Action items
 * - Subscription details
 * - Resources
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    if (req.method === 'GET') {
      // Get client email from query param (in production, use JWT token)
      const { email, contactId } = req.query;

      if (!email && !contactId) {
        return res.status(400).json({
          error: 'Email or contact ID required'
        });
      }

      // Get client details
      let contact;
      if (contactId) {
        contact = await db.queryOne(
          'SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2 AND client_status = $3',
          [contactId, tenantId, 'active']
        );
      } else {
        contact = await db.queryOne(
          'SELECT * FROM contacts WHERE email = $1 AND tenant_id = $2 AND client_status = $3',
          [email, tenantId, 'active']
        );
      }

      if (!contact) {
        return res.status(404).json({
          error: 'Active client not found'
        });
      }

      // Get upcoming strategy calls
      const upcomingCalls = await db.query(
        `SELECT * FROM strategy_calls
         WHERE contact_id = $1 AND tenant_id = $2
         AND scheduled_at > NOW()
         AND status IN ('scheduled', 'confirmed')
         ORDER BY scheduled_at ASC
         LIMIT 10`,
        [contact.id, tenantId]
      );

      // Get past strategy calls (last 6 months)
      const pastCalls = await db.query(
        `SELECT * FROM strategy_calls
         WHERE contact_id = $1 AND tenant_id = $2
         AND scheduled_at <= NOW()
         AND status = 'completed'
         ORDER BY scheduled_at DESC
         LIMIT 20`,
        [contact.id, tenantId]
      );

      // Get discovery calls too
      const discoveryCalls = await db.query(
        `SELECT * FROM discovery_calls
         WHERE contact_id = $1 AND tenant_id = $2
         ORDER BY scheduled_at DESC
         LIMIT 5`,
        [contact.id, tenantId]
      );

      // Get tasks/action items
      const actionItems = await db.query(
        `SELECT * FROM tasks
         WHERE contact_id = $1 AND tenant_id = $2
         AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 20`,
        [contact.id, tenantId]
      );

      // Get recent activities
      const recentActivities = await db.query(
        `SELECT * FROM contact_activities
         WHERE contact_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT 30`,
        [contact.id, tenantId]
      );

      // Calculate subscription details
      const subscriptionDetails = {
        tier: contact.client_tier || 'strategy',
        status: contact.client_status || 'active',
        mrr: contact.mrr || 0,
        clientSince: contact.client_since,
        stripeCustomerId: contact.stripe_customer_id,
        hasAITools: contact.unbound_user_id ? true : false,
        unboundUserId: contact.unbound_user_id
      };

      // Get tier benefits
      const tierBenefits = getTierBenefits(contact.client_tier);

      return res.status(200).json({
        success: true,
        client: {
          id: contact.id,
          name: contact.full_name,
          email: contact.email,
          company: contact.company,
          phone: contact.phone
        },
        subscription: subscriptionDetails,
        tierBenefits,
        upcomingCalls: upcomingCalls.map(formatCall),
        pastCalls: pastCalls.map(formatCall),
        discoveryCalls: discoveryCalls.map(formatDiscoveryCall),
        actionItems: actionItems.map(formatTask),
        recentActivities: recentActivities.map(formatActivity)
      });
    }

    if (req.method === 'POST') {
      const { action, contactId, data } = req.body;

      switch (action) {
        case 'submit_feedback':
          // Save client feedback
          const { callId, rating, feedback } = data;

          await db.insert('contact_activities', {
            tenant_id: tenantId,
            contact_id: contactId,
            type: 'client_feedback',
            description: `Rating: ${rating}/5\n\nFeedback: ${feedback}\n\nCall ID: ${callId}`,
            created_at: new Date()
          });

          return res.status(200).json({ success: true, message: 'Feedback submitted' });

        case 'update_profile':
          // Update client profile
          const { phone, company } = data;

          await db.queryOne(
            'UPDATE contacts SET phone = $1, company = $2, updated_at = $3 WHERE id = $4 AND tenant_id = $5 RETURNING *',
            [phone, company, new Date(), contactId, tenantId]
          );

          return res.status(200).json({ success: true, message: 'Profile updated' });

        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Client Portal] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get tier-specific benefits
 */
function getTierBenefits(tier) {
  const benefits = {
    strategy: {
      name: 'Strategy Tier',
      price: '$2,500/month',
      features: [
        'Monthly strategy sessions',
        'Private Slack channel access',
        'Strategic counsel and planning',
        'Direct access to Maggie Forbes'
      ]
    },
    premium: {
      name: 'Premium Tier',
      price: '$5,000/month',
      features: [
        'Bi-weekly strategy sessions',
        'Private Slack channel access',
        'Strategic counsel and planning',
        'Direct access to Maggie Forbes',
        'Unlimited AI tools access (Growth Manager Pro)',
        'Intent-based prospecting systems',
        'AI-powered personalization & qualification'
      ]
    },
    enterprise: {
      name: 'Enterprise Tier',
      price: '$10,000+/month',
      features: [
        'Weekly strategy sessions',
        'Private Slack channel with white-glove support',
        'Dedicated account manager',
        'Strategic counsel and planning',
        'Direct access to Maggie Forbes',
        'Unlimited AI tools access (Growth Manager Pro)',
        'Intent-based prospecting systems',
        'AI-powered personalization & qualification',
        'Complete operational automation',
        'Done-for-you service options'
      ]
    }
  };

  return benefits[tier] || benefits.strategy;
}

/**
 * Format call for client display
 */
function formatCall(call) {
  return {
    id: call.id,
    scheduledAt: call.scheduled_at,
    status: call.status,
    meetingLink: call.meeting_link,
    notes: call.notes || '',
    actionItems: call.action_items || '',
    nextSteps: call.next_steps || '',
    isPast: new Date(call.scheduled_at) < new Date()
  };
}

/**
 * Format discovery call
 */
function formatDiscoveryCall(call) {
  return {
    id: call.id,
    scheduledAt: call.scheduled_at,
    status: call.status,
    meetingLink: call.meeting_link,
    notes: call.notes || '',
    keyInsights: call.key_insights || '',
    qualificationScore: call.qualification_score
  };
}

/**
 * Format task/action item
 */
function formatTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueDate: task.due_date_text,
    createdAt: task.created_at
  };
}

/**
 * Format activity
 */
function formatActivity(activity) {
  return {
    id: activity.id,
    type: activity.type,
    description: activity.description,
    createdAt: activity.created_at
  };
}
