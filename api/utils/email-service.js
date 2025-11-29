const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Email Service for MFS
 * Handles all outbound email communications
 */

/**
 * Send a booking link to a qualified lead
 */
async function sendBookingLink(contact) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] No RESEND_API_KEY configured - logging instead');
    console.log(`[Email] Would send booking link to ${contact.email}`);
    return { success: false, error: 'No API key configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Maggie Forbes <maggie@maggieforbesstrategies.com>',
      to: [contact.email],
      subject: 'Let\'s Schedule Your Discovery Call',
      html: `
        <p>Hi ${contact.full_name || 'there'},</p>

        <p>Thank you for your interest in strategic growth consulting. I'd love to learn more about your business and explore how we can help you scale.</p>

        <p><strong>Book your discovery call here:</strong><br/>
        <a href="https://calendly.com/maggie-maggieforbesstrategies/discovery-call">Schedule Discovery Call</a></p>

        <p>Looking forward to speaking with you!</p>

        <p>Best regards,<br/>
        Maggie Forbes<br/>
        Maggie Forbes Strategies</p>
      `
    });

    if (error) {
      console.error('[Email] Error sending booking link:', error);
      return { success: false, error };
    }

    console.log('[Email] Booking link sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('[Email] Exception sending booking link:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a follow-up email
 */
async function sendFollowUpEmail(contact, message) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] No RESEND_API_KEY configured - logging instead');
    console.log(`[Email] Would send follow-up to ${contact.email}: ${message}`);
    return { success: false, error: 'No API key configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Maggie Forbes <maggie@maggieforbesstrategies.com>',
      to: [contact.email],
      subject: 'Following Up',
      html: `
        <p>Hi ${contact.full_name || 'there'},</p>

        <p>${message}</p>

        <p>Best regards,<br/>
        Maggie Forbes<br/>
        Maggie Forbes Strategies</p>
      `
    });

    if (error) {
      console.error('[Email] Error sending follow-up:', error);
      return { success: false, error };
    }

    console.log('[Email] Follow-up sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('[Email] Exception sending follow-up:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send consultation reminder
 */
async function sendConsultationReminder(call) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] No RESEND_API_KEY configured - logging instead');
    console.log(`[Email] Would send reminder for ${call.type} to ${call.contact_email}`);
    return { success: false, error: 'No API key configured' };
  }

  const hoursUntil = Math.round((new Date(call.scheduled_at) - new Date()) / (1000 * 60 * 60));

  try {
    const { data, error } = await resend.emails.send({
      from: 'Maggie Forbes <maggie@maggieforbesstrategies.com>',
      to: [call.contact_email],
      subject: `Reminder: ${call.type.replace('_', ' ')} in ${hoursUntil} hours`,
      html: `
        <p>Hi ${call.contact_name || 'there'},</p>

        <p>This is a friendly reminder about our upcoming ${call.type.replace('_', ' ')} scheduled for:</p>

        <p><strong>${new Date(call.scheduled_at).toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        })}</strong></p>

        ${call.meeting_link ? `<p><strong>Join Link:</strong> <a href="${call.meeting_link}">${call.meeting_link}</a></p>` : ''}

        <p>I'm looking forward to our conversation!</p>

        <p>Best regards,<br/>
        Maggie Forbes<br/>
        Maggie Forbes Strategies</p>
      `
    });

    if (error) {
      console.error('[Email] Error sending reminder:', error);
      return { success: false, error };
    }

    console.log('[Email] Reminder sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('[Email] Exception sending reminder:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send thank you after discovery call
 */
async function sendThankYouEmail(contact) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] No RESEND_API_KEY configured - logging instead');
    console.log(`[Email] Would send thank you to ${contact.email}`);
    return { success: false, error: 'No API key configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Maggie Forbes <maggie@maggieforbesstrategies.com>',
      to: [contact.email],
      subject: 'Thank You - Next Steps',
      html: `
        <p>Hi ${contact.full_name || 'there'},</p>

        <p>Thank you for taking the time to speak with me today. I enjoyed learning more about your business and the challenges you're facing.</p>

        <p>I'll be putting together a customized proposal for you and will have that ready within the next few days.</p>

        <p>In the meantime, if you have any questions, please don't hesitate to reach out.</p>

        <p>Best regards,<br/>
        Maggie Forbes<br/>
        Maggie Forbes Strategies</p>
      `
    });

    if (error) {
      console.error('[Email] Error sending thank you:', error);
      return { success: false, error };
    }

    console.log('[Email] Thank you sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('[Email] Exception sending thank you:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send proposal follow-up
 */
async function sendProposalFollowUp(contact) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] No RESEND_API_KEY configured - logging instead');
    console.log(`[Email] Would send proposal follow-up to ${contact.email}`);
    return { success: false, error: 'No API key configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Maggie Forbes <maggie@maggieforbesstrategies.com>',
      to: [contact.email],
      subject: 'Checking In - Proposal Questions?',
      html: `
        <p>Hi ${contact.full_name || 'there'},</p>

        <p>I wanted to follow up on the proposal I sent over. Have you had a chance to review it?</p>

        <p>I'm happy to answer any questions you might have or discuss how we can customize the approach for your specific needs.</p>

        <p>Would you like to schedule a quick call to discuss?</p>

        <p>Best regards,<br/>
        Maggie Forbes<br/>
        Maggie Forbes Strategies</p>
      `
    });

    if (error) {
      console.error('[Email] Error sending proposal follow-up:', error);
      return { success: false, error };
    }

    console.log('[Email] Proposal follow-up sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('[Email] Exception sending proposal follow-up:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendBookingLink,
  sendFollowUpEmail,
  sendConsultationReminder,
  sendThankYouEmail,
  sendProposalFollowUp
};
