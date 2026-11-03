import mongoose from "mongoose";

const DeletedAccountSchema = new mongoose.Schema({
  originalUserId: {
    type: String, // Storing as String to preserve the ID even if User doc is gone
    required: true
  },
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'companion', 'admin', 'superadmin'],
    required: true
  },
  deletedBy: {
    type: mongoose.Schema.Types.Mixed,
    ref: 'User',
    default: 'Admin'
  },
  deletionReason: {
    type: String,
    default: 'Admin action'
  },
  fullName: {
    type: String
  },
  phoneNumber: {
    type: String
  },
  categoryType: {
    type: String
  },
  pricePerHour: {
    type: String
  },
  deletedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const DeletedAccount = mongoose.model("DeletedAccount", DeletedAccountSchema);
export default DeletedAccount;
