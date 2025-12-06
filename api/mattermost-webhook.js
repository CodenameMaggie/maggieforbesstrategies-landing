const db = require('./utils/db');

/**
 * MATTERMOST WEBHOOK INTEGRATION
 * Posts to Mattermost channels automatically
 *
 * Channels:
 * - #scraping-alerts - Scout agent posts leads
 * - #client-delivery - Implementation status
 * - #learning-loop - Win rate improvements
 * - #billing - Stripe commission notifications
 * - #clients-{tenant} - Per-client workspace
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenantId = process.env.MFS_TENANT_ID || 'mfs-001';

  try {
    const { channelType, message, data } = req.body;

    if (!channelType || !message) {
      return res.status(400).json({
        error: 'Missing required fields: channelType, message'
      });
    }

    // Get channel webhook URL
    const channel = await getChannelWebhook(channelType, data?.contactId, tenantId);

    if (!channel || !channel.webhook_url) {
      console.log(`[Mattermost] No webhook configured for ${channelType}`);
      return res.status(200).json({
        success: false,
        message: 'Webhook not configured for this channel'
      });
    }

    // Format message based on channel type
    const formattedMessage = formatMessage(channelType, message, data);

    // Post to Mattermost
    const posted = await postToMattermost(channel.webhook_url, formattedMessage);

    // Log the post
    await db.insert('delivery_automations', {
      tenant_id: tenantId,
      contact_id: data?.contactId,
      automation_type: 'mattermost_post',
      trigger_event: channelType,
      status: posted ? 'completed' : 'failed',
      action_description: `Posted to ${channelType}: ${message.substring(0, 100)}`,
      mattermost_posted: posted,
      result_data: { channel_type: channelType, channel_id: channel.channel_id },
      executed_at: new Date(),
      created_at: new Date()
    });

    return res.status(200).json({
      success: true,
      posted,
      channel: channelType
    });

  } catch (error) {
    console.error('[Mattermost Webhook] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get channel webhook URL
 */
async function getChannelWebhook(channelType, contactId, tenantId) {
  let query = `
    SELECT * FROM mattermost_integrations
    WHERE tenant_id = $1 AND channel_type = $2
  `;
  const params = [tenantId, channelType];

  if (contactId && channelType === 'client_workspace') {
    query += ' AND contact_id = $3';
    params.push(contactId);
  }

  query += ' AND auto_post_enabled = true LIMIT 1';

  return await db.queryOne(query, params);
}

/**
 * Format message based on channel type
 */
function formatMessage(channelType, message, data) {
  const timestamp = new Date().toLocaleString();

  switch (channelType) {
    case 'scraping_alerts':
      return {
        text: `🚨 **New Prospects Found** (${timestamp})`,
        attachments: [{
          color: '#00c851',
          text: message,
          fields: data?.prospects?.map(p => ({
            title: p.companyName,
            value: `${p.recentSignal}\nIndustry: ${p.industry}\nIntent Score: ${p.intentScore}`,
            short: false
          })) || []
        }]
      };

    case 'client_delivery':
      return {
        text: `📦 **Client Delivery Update** (${timestamp})`,
        attachments: [{
          color: '#4285f4',
          text: message,
          fields: data?.deliverable ? [
            {
              title: 'Deliverable',
              value: data.deliverable.title,
              short: true
            },
            {
              title: 'Status',
              value: data.deliverable.status.toUpperCase(),
              short: true
            },
            {
              title: 'Client',
              value: data.clientName || 'Unknown',
              short: true
            },
            {
              title: 'Due Date',
              value: data.deliverable.due_date || 'Not set',
              short: true
            }
          ] : []
        }]
      };

    case 'learning_loop':
      return {
        text: `📈 **Learning Loop Insight** (${timestamp})`,
        attachments: [{
          color: '#ff6f00',
          text: message,
          fields: data?.metric ? [
            {
              title: 'Metric',
              value: data.metric.metric_type,
              short: true
            },
            {
              title: 'Improvement',
              value: `${data.metric.improvement_pct}%`,
              short: true
            },
            {
              title: 'Baseline',
              value: data.metric.baseline_value,
              short: true
            },
            {
              title: 'Current',
              value: data.metric.current_value,
              short: true
            }
          ] : []
        }]
      };

    case 'billing':
      return {
        text: `💰 **Billing Notification** (${timestamp})`,
        attachments: [{
          color: '#2bbbad',
          text: message,
          fields: data?.payment ? [
            {
              title: 'Amount',
              value: `$${data.payment.amount}`,
              short: true
            },
            {
              title: 'Client',
              value: data.payment.clientName,
              short: true
            },
            {
              title: 'Type',
              value: data.payment.type || 'Payment',
              short: true
            },
            {
              title: 'Status',
              value: data.payment.status || 'Succeeded',
              short: true
            }
          ] : []
        }]
      };

    case 'client_workspace':
      return {
        text: message,
        attachments: data?.attachments || []
      };

    default:
      return {
        text: message
      };
  }
}

/**
 * Post to Mattermost via webhook
 */
async function postToMattermost(webhookUrl, payload) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('[Mattermost] Post failed:', response.status, response.statusText);
      return false;
    }

    console.log('[Mattermost] ✓ Posted successfully');
    return true;

  } catch (error) {
    console.error('[Mattermost] Post error:', error.message);
    return false;
  }
}

/**
 * Helper: Post to scraping alerts channel
 */
async function postScrapingAlert(prospects, tenantId) {
  const message = `Found ${prospects.length} new high-intent prospects`;

  return await fetch('/api/mattermost-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'scraping_alerts',
      message,
      data: { prospects }
    })
  });
}

/**
 * Helper: Post deliverable completion to client workspace
 */
async function postDeliverableToClient(deliverable, contact, tenantId) {
  const message = `✅ **Deliverable Completed**\n\n**${deliverable.title}**\n\n${deliverable.description}`;

  const attachments = [];

  if (deliverable.file_url) {
    attachments.push({
      color: '#00c851',
      text: `📎 [Download Deliverable](${deliverable.file_url})`
    });
  }

  return await fetch('/api/mattermost-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'client_workspace',
      message,
      data: {
        contactId: contact.id,
        deliverable,
        clientName: contact.full_name,
        attachments
      }
    })
  });
}

/**
 * Helper: Post session summary to client workspace
 */
async function postSessionSummary(call, contact, tenantId) {
  const date = new Date(call.scheduled_at).toLocaleDateString();

  const message = `📝 **Strategy Session Summary** - ${date}\n\n` +
    `**Notes:**\n${call.notes || 'No notes recorded'}\n\n` +
    `**Action Items:**\n${call.action_items || 'None'}\n\n` +
    `**Next Steps:**\n${call.next_steps || 'TBD'}`;

  return await fetch('/api/mattermost-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelType: 'client_workspace',
      message,
      data: {
        contactId: contact.id,
        call,
        clientName: contact.full_name
      }
    })
  });
}

// Export helpers
module.exports.postScrapingAlert = postScrapingAlert;
module.exports.postDeliverableToClient = postDeliverableToClient;
module.exports.postSessionSummary = postSessionSummary;
