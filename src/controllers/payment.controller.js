
import Razorpay from 'razorpay';
import crypto from 'crypto';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { notifyUser, notifyAdmins } from '../utils/notifications.js';

/**
 * Razorpay client, built on first use.
 */
let razorpayClient = null;
const getRazorpay = () => {
    if (!razorpayClient) {
        const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            throw new Error('Razorpay is not configured on this server.');
        }
        razorpayClient = new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET,
        });
    }
    return razorpayClient;
};

/** Amount owed for a booking, in paise. Single source of truth. */
const amountDueInPaise = (booking) => {
    if (booking.totalAmount) {
        return Math.round(booking.totalAmount * 100);
    }
    const hours = (parseInt(booking.duration, 10) || 60) / 60;
    const base = Math.round(booking.pricePerHour * hours * 100);
    const fee = (booking.platformFee || 50) * 100;
    return base + fee;
};

export const createPaymentIntent = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const userId = req.user.id; // From auth middleware

        const booking = await Booking.findById(bookingId);
        
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        // Ensure the user requesting payment is the one who made the booking
        if (booking.requesterId.toString() !== userId) {
            return res.status(403).json({ message: "Unauthorized to pay for this booking." });
        }

        if (booking.status === 'cancelled' || booking.status === 'rejected') {
            return res.status(400).json({ message: "Cannot pay for a cancelled or rejected booking." });
        }

        if (booking.paymentStatus === 'paid') {
            return res.status(400).json({ message: "Booking is already paid." });
        }

        // Calculate amount (including transparent platform fee)
        const amountInPaise = amountDueInPaise(booking);

        // IDEMPOTENCY: If an order was already created for this booking, reuse it
        // This prevents duplicate orders if the user clicks Pay multiple times
        if (booking.razorpayOrderId) {
            try {
                const existingOrder = await getRazorpay().orders.fetch(booking.razorpayOrderId);
                if (existingOrder && existingOrder.status !== 'paid') {
                    return res.status(200).json({
                        orderId: existingOrder.id,
                        amount: existingOrder.amount,
                        currency: existingOrder.currency,
                        keyId: process.env.RAZORPAY_KEY_ID
                    });
                }
            } catch (fetchErr) {
                // If fetch fails, fall through and create a new order
                console.warn("Could not fetch existing Razorpay order, creating new one:", fetchErr.message);
            }
        }

        // Create a new Razorpay Order
        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: booking._id.toString(),
            notes: {
                bookingId: booking._id.toString(),
                requesterId: userId
            }
        };

        const order = await getRazorpay().orders.create(options);

        // Save the order ID to the booking
        booking.razorpayOrderId = order.id;
        await booking.save();

        res.status(200).json({
            orderId: order.id,
            amount: amountInPaise,
            currency: 'INR',
            keyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Create Payment Intent Error:", error);
        res.status(500).json({ message: "Failed to create payment intent.", error: "Payment initialization failed." });
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, bookingId } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !bookingId) {
            return res.status(400).json({ message: "Payment details and Booking ID are required." });
        }

        // 1. The signature proves a payment happened on OUR merchant account.
        //    On its own it says nothing about WHICH booking that payment was for.
        const body = razorpayOrderId + "|" + razorpayPaymentId;

        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const providedSignature = Buffer.from(String(razorpaySignature), 'utf8');
        const computedSignature = Buffer.from(expectedSignature, 'utf8');
        const signatureValid =
            providedSignature.length === computedSignature.length &&
            crypto.timingSafeEqual(providedSignature, computedSignature);

        if (!signatureValid) {
            return res.status(400).json({ message: "Payment signature verification failed." });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        // 2. The caller must own this booking.
        if (booking.requesterId.toString() !== req.user.id.toString()) {
            return res.status(403).json({ message: "Unauthorized to pay for this booking." });
        }

        // 3. The order must be the one WE created for THIS booking. Without this,
        //    a genuine signature from a cheap booking can be replayed against an
        //    expensive one.
        if (!booking.razorpayOrderId || booking.razorpayOrderId !== razorpayOrderId) {
            return res.status(400).json({ message: "This payment does not belong to this booking." });
        }

        // Idempotent: If already marked paid (e.g., webhook already processed), just return success
        if (booking.paymentStatus === 'paid') {
            return res.status(200).json({ message: "Payment already verified.", booking });
        }

        // Fetch the payment from Razorpay — the authoritative record of what was charged.
        const payment = await getRazorpay().payments.fetch(razorpayPaymentId);

        // 4. The payment must belong to the order we just matched.
        if (payment.order_id !== razorpayOrderId) {
            return res.status(400).json({ message: "Payment does not match the order." });
        }

        // 5. It must actually have been captured, not merely created or authorized.
        if (payment.status !== 'captured') {
            return res.status(400).json({ message: `Payment is not complete (status: ${payment.status}).` });
        }

        // 6. The amount charged must cover what is owed.
        const expectedPaise = amountDueInPaise(booking);
        if (payment.amount < expectedPaise) {
            console.error(
                `Underpayment on booking ${booking._id}: paid ${payment.amount} paise, owed ${expectedPaise}`
            );
            return res.status(400).json({ message: "Amount paid is less than the amount due." });
        }

        booking.paymentStatus = 'paid';
        booking.razorpayPaymentId = razorpayPaymentId;
        booking.razorpaySignature = razorpaySignature;
        booking.amountPaid = payment.amount / 100;

        // Transition booking to prepaid awaiting companion if not yet accepted
        if (booking.status === 'pending') {
            booking.status = 'paid_awaiting_companion';
        }
        if (booking.companionId) {
            booking.currentOfferCompanionId = booking.companionId;
            booking.offerExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        }
        await booking.save();

        const refId = booking._id.toString().slice(-6).toUpperCase();

        // 1. Notify Customer
        await notifyUser({
            userId: booking.requesterId,
            eventKey: 'PAYMENT_RECEIVED',
            bookingId: booking._id
        });

        // 2. Notify Companion (New offer)
        if (booking.companionId) {
            await notifyUser({
                userId: booking.companionId,
                eventKey: 'NEW_OFFER',
                bookingId: booking._id
            });
        }

        // 3. Notify Admin
        await notifyAdmins({
            eventKey: 'Payment Received',
            summary: `Payment of ₹${booking.amountPaid} received for booking #${refId}. We are finding / assigning an eligible companion.`,
            bookingId: booking._id
        });

        res.status(200).json({ 
            message: "Your payment has been received. We're finding an eligible companion for your booking. Your session will be confirmed when a companion accepts.", 
            booking 
        });

    } catch (error) {
        console.error("Verify Payment Error:", error);
        res.status(500).json({ message: "Failed to verify payment.", error: error.message });
    }
};
