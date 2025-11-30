const Stripe = require('stripe');
const db = require('./utils/db');

/**
 * STRIPE CHECKOUT SESSION CREATION
 * Creates a Stripe Checkout session for MFS consulting tiers
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const tenantId = process.env.MFS_TENANT_ID || '00000000-0000-0000-0000-000000000001';

  try {
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

    // Get contact details
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

    // Price IDs from environment variables
    const priceIds = {
      strategy: process.env.STRIPE_STRATEGY_PRICE_ID,
      premium: process.env.STRIPE_PREMIUM_PRICE_ID,
      enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID
    };

    const priceId = priceIds[tier];

    if (!priceId) {
      return res.status(400).json({
        error: `Stripe price ID not configured for tier: ${tier}. Please set STRIPE_${tier.toUpperCase()}_PRICE_ID`
      });
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = contact.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: contact.email,
        name: contact.full_name || contact.email,
        metadata: {
          mfs_contact_id: contactId,
          mfs_tenant_id: tenantId
        }
      });

      stripeCustomerId = customer.id;

      // Save Stripe customer ID to database
      await db.query(
        `UPDATE contacts SET stripe_customer_id = $1, updated_at = $2 WHERE id = $3`,
        [stripeCustomerId, new Date(), contactId]
      );
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://maggieforbesstrategies.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://maggieforbesstrategies.com'}/pricing`,
      metadata: {
        mfs_contact_id: contactId,
        mfs_tier: tier,
        mfs_tenant_id: tenantId
      },
      subscription_data: {
        metadata: {
          mfs_contact_id: contactId,
          mfs_tier: tier,
          mfs_tenant_id: tenantId
        }
      }
    });

    // Log activity
    await db.insert('contact_activities', {
      tenant_id: tenantId,
      contact_id: contactId,
      type: 'checkout_created',
      description: `Stripe checkout session created for ${tier} tier ($${tier === 'strategy' ? '2,500' : tier === 'premium' ? '5,000' : '10,000'}/mo)`,
      created_at: new Date()
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('[Stripe Checkout] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
};
