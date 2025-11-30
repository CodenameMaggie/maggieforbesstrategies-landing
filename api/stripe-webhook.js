const Stripe = require('stripe');
const db = require('./utils/db');

/**
 * STRIPE WEBHOOK HANDLER
 * Handles Stripe events for subscription management
 *
 * Events handled:
 * - checkout.session.completed - New subscription created
 * - customer.subscription.updated - Subscription changed
 * - customer.subscription.deleted - Subscription cancelled
 * - invoice.payment_succeeded - Payment successful
 * - invoice.payment_failed - Payment failed
 */

module.exports = async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    // Verify webhook signature
    const signature = req.headers['stripe-signature'];

    if (!webhookSecret) {
      console.warn('[Stripe Webhook] No STRIPE_WEBHOOK_SECRET configured - skipping signature verification');
      event = req.body;
    } else {
      // Get raw body for signature verification
      const payload = JSON.stringify(req.body);
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    const tenantId = process.env.MFS_TENANT_ID || '00000000-0000-0000-0000-000000000001';

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session, tenantId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdated(subscription, tenantId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription, tenantId);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(invoice, tenantId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(invoice, tenantId);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return res.status(400).json({
      error: 'Webhook error',
      details: error.message
    });
  }
};

/**
 * Handle checkout session completed - provision client
 */
async function handleCheckoutCompleted(session, tenantId) {
  console.log('[Stripe Webhook] Checkout completed:', session.id);

  const contactId = session.metadata?.mfs_contact_id;
  const tier = session.metadata?.mfs_tier;

  if (!contactId || !tier) {
    console.error('[Stripe Webhook] Missing metadata in checkout session');
    return;
  }

  // Call provision-client endpoint to set up the client
  try {
    const provisionResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://maggieforbesstrategies.com'}/api/provision-client`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, tier })
      }
    );

    if (provisionResponse.ok) {
      console.log(`[Stripe Webhook] Client provisioned successfully: ${contactId}`);
    } else {
      const error = await provisionResponse.text();
      console.error('[Stripe Webhook] Provisioning failed:', error);
    }

    // Log activity
    await db.insert('contact_activities', {
      tenant_id: tenantId,
      contact_id: contactId,
      type: 'subscription_created',
      description: `Stripe subscription created for ${tier} tier. Session: ${session.id}`,
      created_at: new Date()
    });

  } catch (error) {
    console.error('[Stripe Webhook] Error provisioning client:', error);
  }
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(subscription, tenantId) {
  console.log('[Stripe Webhook] Subscription updated:', subscription.id);

  const contactId = subscription.metadata?.mfs_contact_id;
  const tier = subscription.metadata?.mfs_tier;

  if (!contactId) {
    console.error('[Stripe Webhook] No contact ID in subscription metadata');
    return;
  }

  // Update client status based on subscription status
  let clientStatus = 'active';
  if (subscription.status === 'past_due') {
    clientStatus = 'past_due';
  } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
    clientStatus = 'paused';
  }

  await db.query(
    `UPDATE contacts
     SET client_status = $1, updated_at = $2
     WHERE id = $3`,
    [clientStatus, new Date(), contactId]
  );

  await db.insert('contact_activities', {
    tenant_id: tenantId,
    contact_id: contactId,
    type: 'subscription_updated',
    description: `Subscription status: ${subscription.status}`,
    created_at: new Date()
  });
}

/**
 * Handle subscription deleted/cancelled
 */
async function handleSubscriptionDeleted(subscription, tenantId) {
  console.log('[Stripe Webhook] Subscription deleted:', subscription.id);

  const contactId = subscription.metadata?.mfs_contact_id;

  if (!contactId) {
    console.error('[Stripe Webhook] No contact ID in subscription metadata');
    return;
  }

  // Mark client as churned
  await db.query(
    `UPDATE contacts
     SET client_status = 'churned', updated_at = $1
     WHERE id = $2`,
    [new Date(), contactId]
  );

  await db.insert('contact_activities', {
    tenant_id: tenantId,
    contact_id: contactId,
    type: 'subscription_cancelled',
    description: `Subscription cancelled. ID: ${subscription.id}`,
    created_at: new Date()
  });

  // Create task for re-engagement
  await db.insert('tasks', {
    tenant_id: tenantId,
    contact_id: contactId,
    title: `Follow up on cancelled subscription`,
    description: `Client cancelled their subscription. Reach out to understand why and see if we can re-engage.`,
    priority: 'high',
    status: 'pending',
    source: 'stripe_webhook',
    due_date_text: 'This week',
    created_at: new Date()
  });
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice, tenantId) {
  console.log('[Stripe Webhook] Payment succeeded:', invoice.id);

  const subscription = invoice.subscription;
  if (!subscription) return;

  // Find contact by Stripe customer ID
  const contact = await db.queryOne(
    `SELECT id FROM contacts WHERE stripe_customer_id = $1`,
    [invoice.customer]
  );

  if (contact) {
    await db.insert('contact_activities', {
      tenant_id: tenantId,
      contact_id: contact.id,
      type: 'payment_succeeded',
      description: `Payment received: $${(invoice.amount_paid / 100).toFixed(2)}. Invoice: ${invoice.id}`,
      created_at: new Date()
    });
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice, tenantId) {
  console.log('[Stripe Webhook] Payment failed:', invoice.id);

  // Find contact by Stripe customer ID
  const contact = await db.queryOne(
    `SELECT id, full_name, email FROM contacts WHERE stripe_customer_id = $1`,
    [invoice.customer]
  );

  if (contact) {
    await db.insert('contact_activities', {
      tenant_id: tenantId,
      contact_id: contact.id,
      type: 'payment_failed',
      description: `Payment failed for $${(invoice.amount_due / 100).toFixed(2)}. Invoice: ${invoice.id}`,
      created_at: new Date()
    });

    // Create high-priority task
    await db.insert('tasks', {
      tenant_id: tenantId,
      contact_id: contact.id,
      title: `Payment failed for ${contact.full_name}`,
      description: `Payment of $${(invoice.amount_due / 100).toFixed(2)} failed. Reach out to update payment method.`,
      priority: 'high',
      status: 'pending',
      source: 'stripe_webhook',
      due_date_text: 'Today',
      created_at: new Date()
    });
  }
}
