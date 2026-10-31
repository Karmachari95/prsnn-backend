import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: [
            'booking_request',
            'new_offer',
            'booking_accepted',
            'companion_confirmed',
            'payment_received',
            'payment_completed',
            'no_companion_available',
            'refund_initiated',
            'booking_cancelled',
            'upcoming_booking',
            'admin_alert',
            'other'
        ],
        required: true
    },
    title: {
        type: String
    },
    message: {
        type: String,
        required: true
    },
    bookingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export default Notification;
