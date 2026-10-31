import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendEmail } from './sendEmail.js';

/**
 * Standardized notification event types and copy per specification
 */
export const NOTIFICATION_MESSAGES = {
  // Customer events
  PAYMENT_RECEIVED: {
    type: 'payment_received',
    title: 'Payment Received',
    message: "Payment received for your PRSNN booking. We're finding an eligible companion for your selected time."
  },
  COMPANION_CONFIRMED: {
    type: 'companion_confirmed',
    title: 'Companion Confirmed',
    message: "Your PRSNN booking is confirmed. Your companion has accepted your request. View your booking details in the app."
  },
  NO_COMPANION_AVAILABLE: {
    type: 'no_companion_available',
    title: 'No Companion Available',
    message: "We couldn't find an available companion for your requested time. Your booking has been cancelled, and your payment release or refund is being processed according to our policy."
  },
  REFUND_INITIATED: {
    type: 'refund_initiated',
    title: 'Refund Initiated',
    message: "Your refund has been initiated. You can view its status in your booking details."
  },
  UPCOMING_BOOKING: {
    type: 'upcoming_booking',
    title: 'Upcoming Booking',
    message: "Your PRSNN booking is coming up. Please review your confirmed time and meeting location."
  },

  // Companion events
  NEW_OFFER: {
    type: 'new_offer',
    title: 'New Booking Offer',
    message: "You have a new PRSNN booking offer. Review the activity, duration, location and time before accepting. This offer expires at the time shown in the app."
  },
  BOOKING_CONFIRMED: {
    type: 'booking_accepted',
    title: 'Booking Confirmed',
    message: "You've been assigned a PRSNN booking. Review the confirmed details and make sure you're available for the entire session."
  },
  BOOKING_CANCELLED: {
    type: 'booking_cancelled',
    title: 'Booking Cancelled',
    message: "This PRSNN booking has been cancelled. Check the booking details for any applicable payment or payout updates."
  }
};

/**
 * Helper to notify a specific user (in-app + email)
 */
export const notifyUser = async ({ userId, eventKey, bookingId, customMessage }) => {
  try {
    if (!userId) return;
    const template = NOTIFICATION_MESSAGES[eventKey] || {
      type: 'other',
      title: 'PRSNN Notification',
      message: customMessage || 'You have an update on your PRSNN account.'
    };

    const message = customMessage || template.message;
    const title = template.title;

    // 1. Create in-app notification record
    await Notification.create({
      userId,
      type: template.type,
      title,
      message,
      bookingId: bookingId || null
    });

    // 2. Fetch user to send email
    const query = User.findById(userId);
    const recipient = typeof query?.select === 'function' ? await query.select('email fullName displayName') : await query;
    if (recipient && recipient.email) {
      await sendEmail({
        to: recipient.email,
        subject: `PRSNN - ${title}`,
        text: message,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #ebe5dc; border-radius: 16px; background-color: #faf9f6; color: #1a201c;">
            <div style="margin-bottom: 20px;">
              <h2 style="color: #1e3a2f; margin: 0 0 8px 0; font-size: 22px;">prsnn<span style="color: #d97757;">.</span></h2>
              <p style="color: #6b726a; margin: 0; font-size: 13px; font-weight: 500;">Presence without pressure.</p>
            </div>
            <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e5e0d8; margin-bottom: 20px;">
              <h3 style="margin-top: 0; color: #1e3a2f; font-size: 18px;">${title}</h3>
              <p style="font-size: 15px; line-height: 1.6; color: #2c332e;">${message}</p>
            </div>
            <p style="font-size: 12px; color: #8e958d; text-align: center; margin-top: 24px;">
              &copy; ${new Date().getFullYear()} PRSNN. All rights reserved.
            </p>
          </div>
        `
      }).catch(err => console.warn('Email dispatch warning:', err.message));
    }
  } catch (error) {
    console.error('Error dispatching user notification:', error);
  }
};

/**
 * Helper to notify all platform Admins of key platform events
 */
export const notifyAdmins = async ({ eventKey, summary, bookingId }) => {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }).select('_id email');
    const title = `[Admin Alert] ${eventKey}`;
    const message = summary;

    for (const admin of admins) {
      await Notification.create({
        userId: admin._id,
        type: 'admin_alert',
        title,
        message,
        bookingId: bookingId || null
      });

      if (admin.email) {
        sendEmail({
          to: admin.email,
          subject: `PRSNN Admin: ${title}`,
          text: message,
          html: `<p><b>Admin Booking Event:</b> ${message}</p><p>Booking ID: ${bookingId || 'N/A'}</p>`
        }).catch(err => console.warn('Admin email dispatch warning:', err.message));
      }
    }
  } catch (err) {
    console.error('Error dispatching admin notification:', err);
  }
};
