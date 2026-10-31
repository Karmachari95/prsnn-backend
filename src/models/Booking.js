
import mongoose from 'mongoose';

const BookingSchema = new mongoose.Schema({
    requesterId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    companionId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User'
    },
    status: { 
        type: String, 
        enum: ['pending', 'paid_awaiting_companion', 'accepted', 'rejected', 'completed', 'cancelled'], 
        default: 'pending' 
    },
    activity: { type: String, default: 'Coffee' },
    city: { type: String, default: 'Chennai' },
    location: { type: String, default: '' },
    message: { type: String, default: '' },
    pricePerHour: { type: Number, required: true },
    platformFee: { type: Number, default: 50 },
    totalAmount: { type: Number },
    startTime: { type: String, required: true },
    endTime: { type: String },
    duration: { type: String, enum: ['30', '60', '90', '120', '180', '240'], required: true },
    scheduledDate: { type: Date, default: Date.now },
    genderPreference: { 
        type: String, 
        enum: ['women_only', 'any_gender'], 
        default: 'women_only' 
    },
    genderConsentAcknowledged: { type: Boolean, default: false },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'failed', 'refunded', 'refund_pending'], 
        default: 'pending' 
    },
    offeredCompanionIds: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }],
    currentOfferCompanionId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    offerExpiresAt: { type: Date },
    allocatedCompanionId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    cancellationReason: { type: String, default: '' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    amountPaid: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

BookingSchema.index({ requesterId: 1, createdAt: -1 });
BookingSchema.index({ companionId: 1, status: 1 });
BookingSchema.index({ status: 1, paymentStatus: 1 });
BookingSchema.index({ currentOfferCompanionId: 1, offerExpiresAt: 1 });

const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);
export default Booking;
