import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import { maskPhoneNumber } from '../utils/maskPhoneNumber.js';
import { validateOperatingHours, calculateBookingPrice } from '../utils/bookingRules.js';
import { notifyUser, notifyAdmins } from '../utils/notifications.js';

/**
 * Helper to find the next eligible companion for a booking request
 * Maximum 3 offers per specification.
 */
const findNextEligibleCompanion = async (booking) => {
    try {
        const alreadyOffered = booking.offeredCompanionIds || [];
        if (alreadyOffered.length >= 3) {
            return null; // Exceeded maximum 3 offers
        }

        const bookingDayIndex = new Date(booking.scheduledDate).getDay();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = days[bookingDayIndex];

        const query = {
            role: 'companion',
            verificationStatus: 'verified',
            _id: { $nin: [...alreadyOffered, booking.requesterId] },
            [`availability.${dayName}`]: true
        };

        if (booking.city) {
            query.city = { $regex: new RegExp(`^${booking.city}$`, 'i') };
        }

        // Gender matching rules
        if (booking.genderPreference === 'women_only') {
            query.gender = 'woman';
        }

        const eligible = await User.findOne(query).sort({ createdAt: -1 });
        return eligible;
    } catch (err) {
        console.error('Error finding next eligible companion:', err);
        return null;
    }
};

/**
 * POST /api/bookings/request
 * Create a new prepaid or requested booking with operating hours and gender matching validation
 */
export const createBooking = async (req, res) => {
    try {
        const { 
            companionId, 
            activity = 'Coffee',
            city = 'Chennai',
            location = '',
            message = '', 
            duration = '60', 
            scheduledDate, 
            startTime,
            genderPreference = 'women_only',
            genderConsentAcknowledged = false
        } = req.body;
        const requesterId = req.user.id;

        if (companionId && requesterId === companionId) {
            return res.status(400).json({ message: "You cannot book yourself." });
        }

        if (!scheduledDate || !startTime) {
            return res.status(400).json({ message: "Date and Time are required." });
        }

        // 1. Operating Hours Validation (7:00 AM - 10:00 PM)
        const hoursCheck = validateOperatingHours(startTime, duration);
        if (!hoursCheck.valid) {
            return res.status(400).json({ message: hoursCheck.message });
        }

        const requester = await User.findById(requesterId);
        if (!requester) {
            return res.status(404).json({ message: "Account not found." });
        }

        if (requester.verificationStatus !== 'verified' && requester.role !== 'admin' && requester.role !== 'superadmin') {
            return res.status(403).json({ message: "Identity verification required before creating a booking. Please complete verification." });
        }

        // 2. Women's Safety & Gender Matching Validation
        let effectiveGenderPref = genderPreference;
        if (requester.gender === 'woman') {
            if (genderPreference === 'any_gender' && !genderConsentAcknowledged) {
                return res.status(400).json({
                    message: "Selecting companions of any gender requires acknowledging the safety guidelines consent."
                });
            }
        }

        let companion = null;
        let pricePerHour = 500;

        if (companionId) {
            companion = await User.findById(companionId);
            if (!companion || companion.role !== 'companion') {
                return res.status(404).json({ message: "Companion not found." });
            }

            // Gender validation if women-only is active
            if (effectiveGenderPref === 'women_only' && companion.gender && companion.gender !== 'woman') {
                return res.status(400).json({
                    message: "In accordance with PRSNN's safety policy, women-only matching is active. Please select a woman companion or adjust your matching preference."
                });
            }

            // Day availability validation
            const bookingDayIndex = new Date(scheduledDate).getDay();
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const dayName = days[bookingDayIndex];

            if (companion.availability && !companion.availability[dayName]) {
                return res.status(400).json({ 
                    message: `Companion is not available on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s.` 
                });
            }

            pricePerHour = companion.pricePerHour || 500;
        }

        // 3. Transparent Server-Side Price Calculation
        const pricing = calculateBookingPrice({
            pricePerHour,
            durationMinutes: duration
        });

        const newBooking = new Booking({
            requesterId,
            companionId: companionId || null,
            currentOfferCompanionId: companionId || null,
            activity,
            city: city || (companion?.city || 'Chennai'),
            location,
            message: message || "I would like to request your presence.",
            pricePerHour: pricing.pricePerHour,
            platformFee: pricing.platformFee,
            totalAmount: pricing.totalAmount,
            startTime,
            endTime: hoursCheck.endTime,
            duration: String(duration),
            scheduledDate: new Date(scheduledDate),
            genderPreference: effectiveGenderPref,
            genderConsentAcknowledged: Boolean(genderConsentAcknowledged),
            status: 'pending',
            paymentStatus: 'pending'
        });

        if (companionId) {
            newBooking.offeredCompanionIds = [companionId];
            newBooking.offerExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins offer timeout
        }

        await newBooking.save();

        // Notify companion if one was directly requested
        if (companionId) {
            const requesterDisplayName = requester.displayName || requester.fullName || requester.username || 'A member';
            await notifyUser({
                userId: companionId,
                eventKey: 'NEW_OFFER',
                bookingId: newBooking._id,
                customMessage: `${requesterDisplayName} has sent you a booking offer for ${activity} on ${new Date(scheduledDate).toLocaleDateString('en-IN')} at ${startTime}.`
            });
        }

        res.status(201).json({ 
            message: "Booking request created successfully. Please proceed to payment.", 
            booking: newBooking,
            pricing
        });
    } catch (error) {
        console.error("Create Booking Error:", error);
        res.status(500).json({ message: "Failed to create booking request.", details: error.message });
    }
};

/**
 * GET /api/bookings/my-requests
 * Fetch bookings for the logged-in customer
 */
export const getUserBookings = async (req, res) => {
    try {
        const userId = req.user.id;
        const bookings = await Booking.find({ requesterId: userId })
            .populate('companionId', 'displayName fullName profilePhotoUrl pricePerHour city area gender')
            .sort({ createdAt: -1 });

        // Graceful fallback for deleted companions
        const sanitized = bookings.map(b => {
            const obj = b.toObject();
            if (!obj.companionId) {
                obj.companionId = {
                    fullName: 'Companion (Account Inactive)',
                    displayName: 'Companion',
                    profilePhotoUrl: '',
                    city: obj.city || 'Chennai'
                };
            }
            return obj;
        });

        res.status(200).json(sanitized);
    } catch (error) {
        console.error("Get User Bookings Error:", error);
        res.status(500).json({ message: "Failed to fetch bookings." });
    }
};

/**
 * GET /api/bookings/incoming-requests
 * Fetch bookings / offers for the logged-in companion
 */
export const getCompanionBookings = async (req, res) => {
    try {
        const userId = req.user.id;
        const bookings = await Booking.find({ 
            $or: [
                { companionId: userId },
                { currentOfferCompanionId: userId }
            ]
        })
        .populate('requesterId', 'displayName fullName profilePhotoUrl phoneNumber city')
        .sort({ createdAt: -1 });

        const sanitized = bookings.map(b => {
            const obj = b.toObject();
            if (!obj.requesterId) {
                obj.requesterId = {
                    fullName: 'Member (Account Inactive)',
                    displayName: 'Member',
                    profilePhotoUrl: '',
                    phoneNumber: ''
                };
            }
            return obj;
        });

        res.status(200).json(sanitized);
    } catch (error) {
        console.error("Get Companion Bookings Error:", error);
        res.status(500).json({ message: "Failed to fetch bookings." });
    }
};

/**
 * PUT /api/bookings/:id/status
 * Update booking status with concurrency-safe companion allocation and offer fallback
 */
export const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.id;

        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        const isCurrentOfferCompanion = 
            (booking.currentOfferCompanionId && booking.currentOfferCompanionId.toString() === userId.toString()) ||
            (booking.companionId && booking.companionId.toString() === userId.toString());

        if (!isCurrentOfferCompanion) {
            return res.status(403).json({ message: "Not authorized to update this booking." });
        }

        if (!['accepted', 'rejected', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: "Invalid status." });
        }

        // --- COMPANION ACCEPTS OFFER ---
        if (status === 'accepted') {
            // Check offer expiration
            if (booking.offerExpiresAt && new Date() > booking.offerExpiresAt && booking.status === 'paid_awaiting_companion') {
                return res.status(400).json({ message: "This booking offer has expired." });
            }

            booking.status = 'accepted';
            booking.companionId = userId;
            booking.allocatedCompanionId = userId;
            await booking.save();

            // 1. Notify Customer
            await notifyUser({
                userId: booking.requesterId,
                eventKey: 'COMPANION_CONFIRMED',
                bookingId: booking._id
            });

            // 2. Notify Companion
            await notifyUser({
                userId: userId,
                eventKey: 'BOOKING_CONFIRMED',
                bookingId: booking._id
            });

            // 3. Notify Admin
            await notifyAdmins({
                eventKey: 'Booking Confirmed',
                summary: `Booking #${booking._id.toString().slice(-6).toUpperCase()} was accepted and confirmed by companion.`,
                bookingId: booking._id
            });

            return res.status(200).json({ message: "Booking accepted successfully.", booking });
        }

        // --- COMPANION REJECTS / DECLINES OFFER ---
        if (status === 'rejected') {
            if (!booking.offeredCompanionIds.includes(userId)) {
                booking.offeredCompanionIds.push(userId);
            }

            // Find next eligible companion
            const nextCompanion = await findNextEligibleCompanion(booking);

            if (nextCompanion) {
                // Forward offer to next companion
                booking.currentOfferCompanionId = nextCompanion._id;
                booking.companionId = nextCompanion._id;
                booking.offeredCompanionIds.push(nextCompanion._id);
                booking.offerExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
                await booking.save();

                // Notify next companion
                await notifyUser({
                    userId: nextCompanion._id,
                    eventKey: 'NEW_OFFER',
                    bookingId: booking._id
                });

                return res.status(200).json({ 
                    message: "Offer declined. Transferred to next eligible companion.", 
                    booking 
                });
            } else {
                // All 3 offers failed or no companion available
                booking.status = 'cancelled';
                booking.cancellationReason = 'No companion available';
                if (booking.paymentStatus === 'paid') {
                    booking.paymentStatus = 'refund_pending';
                }
                await booking.save();

                // Notify customer
                await notifyUser({
                    userId: booking.requesterId,
                    eventKey: 'NO_COMPANION_AVAILABLE',
                    bookingId: booking._id
                });

                if (booking.paymentStatus === 'refund_pending') {
                    await notifyUser({
                        userId: booking.requesterId,
                        eventKey: 'REFUND_INITIATED',
                        bookingId: booking._id
                    });
                }

                // Notify Admin
                await notifyAdmins({
                    eventKey: 'Booking Cancelled (No Companion)',
                    summary: `Booking #${booking._id.toString().slice(-6).toUpperCase()} cancelled because all companion offers were exhausted. Refund pending.`,
                    bookingId: booking._id
                });

                return res.status(200).json({ 
                    message: "Offer declined. No additional companion available; booking cancelled and refund initiated.", 
                    booking 
                });
            }
        }

        // --- COMPLETED STATUS ---
        booking.status = status;
        await booking.save();
        res.status(200).json({ message: `Booking marked as ${status}.`, booking });
    } catch (error) {
        console.error("Update Booking Status Error:", error);
        res.status(500).json({ message: "Failed to update booking status." });
    }
};

/**
 * GET /api/bookings/:id
 * Fetch single booking details
 */
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const booking = await Booking.findById(id)
            .populate('requesterId', 'displayName fullName profilePhotoUrl email phoneNumber city')
            .populate('companionId', 'displayName fullName profilePhotoUrl email phoneNumber city pricePerHour');

        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        const requesterIdStr = booking.requesterId?._id?.toString() || booking.requesterId?.toString();
        const companionIdStr = booking.companionId?._id?.toString() || booking.companionId?.toString();
        const isParticipant = requesterIdStr === userId.toString() || companionIdStr === userId.toString();
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

        if (!isParticipant && !isAdmin) {
            return res.status(403).json({ message: "Not authorized to view this booking." });
        }

        res.status(200).json(booking);
    } catch (error) {
        console.error("Get Booking Error:", error);
        res.status(500).json({ message: "Failed to fetch booking details." });
    }
};

/**
 * POST /api/bookings/:id/cancel
 * Cancel booking under the published policy
 */
export const cancelBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.user.id;
        
        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }
        
        const isCompanion = booking.companionId && booking.companionId.toString() === userId.toString();
        const isRequester = booking.requesterId && booking.requesterId.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
        
        if (!isCompanion && !isRequester && !isAdmin) {
            return res.status(403).json({ message: "Not authorized to cancel this booking." });
        }
        
        booking.status = 'cancelled';
        booking.cancellationReason = reason || (isCompanion ? 'Cancelled by companion' : 'Cancelled by member');
        
        if (booking.paymentStatus === 'paid') {
            booking.paymentStatus = 'refund_pending';
        }
        await booking.save();

        // Notify both parties
        if (booking.requesterId) {
            await notifyUser({
                userId: booking.requesterId,
                eventKey: 'BOOKING_CANCELLED',
                bookingId: booking._id
            });
            if (booking.paymentStatus === 'refund_pending') {
                await notifyUser({
                    userId: booking.requesterId,
                    eventKey: 'REFUND_INITIATED',
                    bookingId: booking._id
                });
            }
        }

        if (booking.companionId) {
            await notifyUser({
                userId: booking.companionId,
                eventKey: 'BOOKING_CANCELLED',
                bookingId: booking._id
            });
        }

        // Notify Admin
        await notifyAdmins({
            eventKey: 'Booking Cancelled',
            summary: `Booking #${booking._id.toString().slice(-6).toUpperCase()} was cancelled. Reason: ${booking.cancellationReason}.`,
            bookingId: booking._id
        });
        
        res.status(200).json({ message: "Booking cancelled successfully.", booking });
    } catch (error) {
        console.error("Cancel Booking Error:", error);
        res.status(500).json({ message: "Failed to cancel booking." });
    }
};

/**
 * POST /api/bookings/:id/report
 * In-app safety and incident reporting (Requirement 17.5 & 6)
 */
export const reportBooking = async (req, res) => {
    try {
        const { id } = req.params;
        const { category, details } = req.body;
        const userId = req.user.id;

        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        // Notify Admin of safety report
        await notifyAdmins({
            eventKey: 'Safety Incident Report',
            summary: `User ${userId} filed a report on booking #${booking._id.toString().slice(-6).toUpperCase()}. Category: ${category || 'General misconduct'}. Details: ${details || 'No description provided'}.`,
            bookingId: booking._id
        });

        res.status(200).json({ 
            message: "Your report has been received. Our safety team will review it and follow up according to our safety policy." 
        });
    } catch (error) {
        console.error("Report Booking Error:", error);
        res.status(500).json({ message: "Failed to submit report." });
    }
};

/**
 * GET /api/bookings/:id/messages
 * In-session messages with masked phone numbers
 */
export const getBookingMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const before = req.query.before ? new Date(req.query.before) : null;

        const booking = await Booking.findById(id).select('requesterId companionId status paymentStatus');
        if (!booking) {
            return res.status(404).json({ message: "Booking not found." });
        }

        const requesterIdStr = booking.requesterId?.toString();
        const companionIdStr = booking.companionId?.toString();

        if (requesterIdStr !== userId.toString() && companionIdStr !== userId.toString()) {
            return res.status(403).json({ message: "Not authorized to read messages for this booking." });
        }

        if (requesterIdStr === userId.toString() && booking.paymentStatus !== 'paid') {
            return res.status(403).json({ message: "Payment is required to view messages for this booking." });
        }

        const query = { bookingId: id };
        if (before && !isNaN(before.getTime())) {
            query.createdAt = { $lt: before };
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const ordered = messages.reverse().map(msg => {
            if (msg.senderId && msg.senderId.toString() !== userId.toString()) {
                msg.content = maskPhoneNumber(msg.content);
            }
            return msg;
        });

        const hasMore = messages.length === limit;

        res.status(200).json({
            messages: ordered,
            hasMore,
            oldest: ordered.length > 0 ? ordered[0].createdAt : null
        });
    } catch (error) {
        console.error("Get Booking Messages Error:", error);
        res.status(500).json({ message: "Failed to fetch messages." });
    }
};
