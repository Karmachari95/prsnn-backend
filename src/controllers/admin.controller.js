
import User from "../models/User.js";
import Admin from "../models/Admin.js";
import Booking from "../models/Booking.js";
import DeletedAccount from "../models/DeletedAccount.js";
import { hashPassword } from "../utils/hash.js";
import { invalidateCompanionsCache } from "./fellows.controller.js";

// Create Admin (Super Admin only)
export const createAdmin = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: "Only Super Admin can create new admins" });
    }

    if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    // Check duplicates
    const existing = await User.findOne({ 
        $or: [{ email: email }, { username: username }] 
    });
    if (existing) {
        return res.status(400).json({ message: "User with this email or username already exists" });
    }

    const hashed = await hashPassword(password);

    // Create User Doc
    const newUser = new User({
        username,
        email,
        password: hashed,
        role: 'admin',
        verificationStatus: 'not_submitted'
    });
    await newUser.save();

    // Create Admin Detail Doc
    const newAdmin = new Admin({
        userId: newUser._id
    });
    await newAdmin.save();



    res.status(201).json({ 
        message: "Admin created successfully", 
        admin: {
            id: newUser._id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            verification_status: newUser.verificationStatus
        }
    });
  } catch (err) {
    console.error("CREATE ADMIN ERROR:", err);
    res.status(500).json({ error: "Failed to create admin: " + err.message });
  }
};

// Get List of Admins (Super Admin only)
export const getAllAdmins = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: "Access denied" });
        }

        const admins = await User.find({ role: 'admin' }).select('-password').sort({ createdAt: -1 });
        
        // Map _id to id
        const mapped = admins.map(a => ({
            id: a._id,
            username: a.username,
            email: a.email,
            role: a.role,
            verification_status: a.verificationStatus,
            created_at: a.createdAt
        }));
        
        res.status(200).json(mapped);
    } catch (err) {
        console.error("GET ALL ADMINS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
};

// Update Admin (Super Admin only)
export const updateAdmin = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: "Only Super Admin can update admins" });
        }

        const { id } = req.params;
        const { username, email, password } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "Admin not found" });
        }

        if (username) user.username = username;
        if (email) user.email = email;
        if (password) {
            user.password = await hashPassword(password);
        }

        await user.save();
        
        res.status(200).json({ 
            message: "Admin updated successfully", 
            admin: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error("UPDATE ADMIN ERROR:", err);
        res.status(500).json({ error: err.message });
    }
};

// Delete Admin (Super Admin only)
export const deleteAdmin = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: "Only Super Admin can delete admins" });
        }

        const { id } = req.params;

        if (req.user.id === id) {
            return res.status(400).json({ message: "You cannot delete your own admin account" });
        }

        // 1. Find user to archive
        const userToDelete = await User.findById(id);
        if (!userToDelete) {
            return res.status(404).json({ message: "Admin not found" });
        }

        // 2. Archive to DeletedAccount
        const archivedAccount = new DeletedAccount({
            originalUserId: userToDelete._id.toString(),
            username: userToDelete.username,
            email: userToDelete.email,
            role: userToDelete.role, // 'admin'
            deletedBy: req.user.id,
            deletionReason: "Super Admin removed admin access"
        });
        await archivedAccount.save();

        // 3. Delete User Doc
        await User.findByIdAndDelete(id);

        // 4. Cleanup Related Docs
        await Admin.deleteOne({ userId: id });

        res.status(200).json({ message: "Admin deleted and archived successfully" });
    } catch (err) {
        console.error("DELETE ADMIN ERROR:", err);
        res.status(500).json({ error: err.message });
    }
};

// Functions for ADMIN role (Verify users, stats)

export const getUnverifiedUsers = async (req, res) => {
  try {
    // Find ALL users (basic users + companions) who have submitted profiles
    // i.e., verificationStatus is 'pending' OR (they have a name but status is 'not_submitted')
    const unverifiedUsers = await User.find({ 
        role: { $in: ['user', 'companion'] },
        $or: [
            { verificationStatus: 'pending' },
            // Fallback for legacy data: catch users with name but default status
            { 
              verificationStatus: 'not_submitted',
              fullName: { $exists: true, $ne: '' }
            }
        ]
    }).select('-password').sort({ createdAt: -1 });
    
    const mapped = unverifiedUsers.map(u => ({
        id: u._id,
        userId: u._id,
        username: u.username,
        email: u.email,
        fullName: u.fullName || u.username || 'Not set',
        phoneNumber: u.phoneNumber || 'Not set',
        role: u.role,
        profilePhotoUrl: u.profilePhotoUrl || u.profile_photo_url || '',
        idProofFrontUrl: u.idProofFrontUrl || u.frontAadharPhoto || '',
        idProofBackUrl: u.idProofBackUrl || u.backAadharPhoto || '',
        verificationStatus: (u.verificationStatus && u.verificationStatus !== 'not_submitted') 
            ? u.verificationStatus 
            : 'pending',
        verification_status: (u.verificationStatus && u.verificationStatus !== 'not_submitted') 
            ? u.verificationStatus 
            : 'pending',
        created_at: u.createdAt,
        createdAt: u.createdAt
    }));
    
    res.status(200).json(mapped);
  } catch (err) {
    console.error("GetUnverifiedUsers Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getUserDetails = async (req, res) => {
    try {
        const { id } = req.params;

        let user = null;
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
            user = await User.findById(id).select('-password');
        }
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Fetch detail profile only for admin/superadmin if exists
        let detailProfile = null;
        if (user.role === 'admin' || user.role === 'superadmin') {
            detailProfile = await Admin.findOne({ userId: id });
        }
        // For 'companion' and 'user', all data is now in the User model itself

        // Effective status logic
        let effectiveStatus = user.verificationStatus;
        if (user.role === 'user') {
            effectiveStatus = (user.isEmailVerified || user.verificationStatus === 'verified') ? 'verified' : (user.verificationStatus || 'not_submitted');
        } else {
            effectiveStatus = (user.verificationStatus && user.verificationStatus !== 'not_submitted')
                ? user.verificationStatus
                : (user.fullName ? 'pending' : 'not_submitted');
        }

        const frontDoc = user.idProofFrontUrl || detailProfile?.frontAadharPhoto || user.frontAadharPhoto;
        const backDoc = user.idProofBackUrl || detailProfile?.backAadharPhoto || user.backAadharPhoto;

        return res.status(200).json({
            id: user._id,
            userId: user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            verification_status: effectiveStatus,
            is_verified: effectiveStatus === 'verified',
            created_at: user.createdAt,
            wantsToBeFellow: user.role === 'companion',
            profilePhotoUrl: user.profilePhotoUrl,
            profile_photo_url: user.profilePhotoUrl, // Backwards compatibility
            fullName: user.fullName || user.username,
            phoneNumber: user.phoneNumber || 'Not provided',
            idProofFrontUrl: frontDoc,
            idProofBackUrl: backDoc,
            verifiedBy: user.verifiedBy, // Expose verifier email
            // Return user object itself as 'profile' since we consolidated schemas
            // Admin details will overwrite if they exist
            profile: {
                ...user.toObject(),
                ...(detailProfile ? detailProfile.toObject() : {}),
                idProofFrontUrl: frontDoc,
                idProofBackUrl: backDoc
            }
        });
    } catch (err) {
        console.error("[Admin] GetUserDetails Error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const verifyUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body; // 'verified' or 'rejected'

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const verifierAdmin = await User.findById(req.user.id);
    const verifierEmail = verifierAdmin ? verifierAdmin.email : "unknown";

    // Update User Document
    const user = await User.findByIdAndUpdate(
        id, 
        { 
            verificationStatus: status,
            verifiedBy: verifierEmail
        },
        { new: true }
    );

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    // A verification decision changes who is publicly listed — show it immediately.
    invalidateCompanionsCache();

    res.status(200).json({
        message: `User ${status}`,
        user: {
            id: user._id,
            verification_status: user.verificationStatus
        }
    });
  } catch (err) {
    console.error("VerifyUser Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// Verify Admin (Super Admin only)
export const verifyAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'verified' or 'rejected'

    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: "Only Super Admin can verify admins" });
    }

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const verifierAdmin = await User.findById(req.user.id);
    const verifierEmail = verifierAdmin ? verifierAdmin.email : "unknown";

    // Update User Document
    const user = await User.findByIdAndUpdate(
        id, 
        { 
            verificationStatus: status,
            verifiedBy: verifierEmail
        },
        { new: true }
    );

    if (!user) {
        return res.status(404).json({ message: "Admin not found" });
    }

    if (user.role !== 'admin') {
        return res.status(400).json({ message: "User is not an admin" });
    }

    // Update Admin detail record if exists
    await Admin.findOneAndUpdate(
        { userId: id },
        { 
            verificationStatus: status,
            verifiedBy: verifierEmail
        }
    );

    res.status(200).json({ 
        message: `Admin ${status} successfully`, 
        user: {
            id: user._id,
            verification_status: user.verificationStatus
        } 
    });
  } catch (err) {
    console.error("VerifyAdmin Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getDashboardStats = async (req, res) => {
    try {
        const [totalFellows, pendingVerifications, verifiedFellows, signupsToday] = await Promise.all([
            User.countDocuments({ role: 'companion' }),
            User.countDocuments({ role: 'companion', verificationStatus: 'pending' }),
            User.countDocuments({ role: 'companion', verificationStatus: 'verified' }),
            User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } })
        ]);

        res.status(200).json({
            signupsToday,
            pendingVerifications,
            totalFellows,
            verifiedFellows
        });
    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const getSuperAdminAnalytics = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: "Access denied" });
        }

        const [
            totalUsers,
            verifiedUsers,
            unverifiedUsers,
            totalFellows,
            verifiedFellows,
            pendingFellows,
            totalAdmins,
            unverifiedAdmins,
            activeToday,
            totalDeleted // New
        ] = await Promise.all([
            User.countDocuments({ role: 'user' }), // Pure users
            User.countDocuments({ role: 'user', isEmailVerified: true }), // Verified pure users
            User.countDocuments({ role: 'user', isEmailVerified: { $ne: true } }), // Pending pure users
            User.countDocuments({ role: 'companion' }),
            User.countDocuments({ role: 'companion', verificationStatus: 'verified' }),
            User.countDocuments({ role: 'companion', verificationStatus: 'pending' }),
            User.countDocuments({ role: 'admin' }),
            User.countDocuments({ role: 'admin', verificationStatus: 'pending' }),
            User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
            DeletedAccount.countDocuments({}) // New Query
        ]);

        const stats = {
            totalUsers,
            totalFellows,
            verifiedFellows,
            pendingFellows,
            totalVerified: verifiedUsers,
            totalUnverified: unverifiedUsers,
            activeToday,
            totalAdmins,
            totalUnverifiedAdmins: unverifiedAdmins,
            totalDeleted // Add to response
        };

        res.status(200).json(stats);
    } catch (err) {
        console.error("Super Admin Analytics Error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        
        const mapped = users.map(r => {
            const isUserRole = r.role === 'user';
            const status = isUserRole
                ? ((r.isEmailVerified || r.verificationStatus === 'verified') ? 'verified' : (r.verificationStatus || 'not_submitted'))
                : (r.verificationStatus || 'pending');

            return {
                id: r._id,
                userId: r._id,
                username: r.username,
                email: r.email,
                fullName: r.fullName || r.username || 'Not set',
                phoneNumber: r.phoneNumber || 'Not provided',
                profilePhotoUrl: r.profilePhotoUrl || r.profile_photo_url || '',
                idProofFrontUrl: r.idProofFrontUrl || r.frontAadharPhoto || '',
                idProofBackUrl: r.idProofBackUrl || r.backAadharPhoto || '',
                verificationStatus: status,
                verification_status: status,
                is_verified: status === 'verified',
                role: r.role,
                created_at: r.createdAt,
                createdAt: r.createdAt
            };
        });

        res.status(200).json(mapped);
    } catch (err) {
        console.error("Get All Users Error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const getAllPayments = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: "Access denied" });
        }

        const payments = await Booking.find({ paymentStatus: 'paid' })
            .populate('requesterId', 'fullName email phoneNumber profilePhotoUrl role')
            .populate('companionId', 'fullName email phoneNumber profilePhotoUrl role')
            .sort({ updatedAt: -1 });

        const mapped = payments.map(b => ({
            _id: b._id,
            payer: {
                _id: b.requesterId?._id,
                fullName: b.requesterId?.fullName || 'Unknown',
                email: b.requesterId?.email || '',
                phoneNumber: b.requesterId?.phoneNumber || '',
                profilePhotoUrl: b.requesterId?.profilePhotoUrl || '',
                role: b.requesterId?.role || 'user'
            },
            recipient: {
                _id: b.companionId?._id,
                fullName: b.companionId?.fullName || 'Unknown',
                email: b.companionId?.email || '',
                phoneNumber: b.companionId?.phoneNumber || '',
                profilePhotoUrl: b.companionId?.profilePhotoUrl || '',
                role: b.companionId?.role || 'companion'
            },
            amountPaid: b.amountPaid,
            duration: b.duration,
            startTime: b.startTime,
            scheduledDate: b.scheduledDate,
            razorpayOrderId: b.razorpayOrderId,
            razorpayPaymentId: b.razorpayPaymentId,
            paymentStatus: b.paymentStatus,
            bookingStatus: b.status,
            paidAt: b.updatedAt
        }));

        res.status(200).json(mapped);
    } catch (err) {
        console.error("Get All Payments Error:", err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteUser = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: "Only Super Admin can delete users" });
        }

        const { id } = req.params;

        // 1. Find user first to archive
        const userToDelete = await User.findById(id);
        
        if (!userToDelete) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2. Archive to DeletedAccount
        const archivedAccount = new DeletedAccount({
            originalUserId: userToDelete._id.toString(),
            username: userToDelete.username,
            email: userToDelete.email,
            role: userToDelete.role,
            fullName: userToDelete.fullName || userToDelete.displayName || userToDelete.username,
            phoneNumber: userToDelete.phoneNumber || 'Not provided',
            categoryType: userToDelete.categoryType || userToDelete.role,
            pricePerHour: userToDelete.hourlyRate ? String(userToDelete.hourlyRate) : 'N/A',
            deletedBy: req.user.id || req.user._id,
            deletionReason: req.body?.reason || "Super Admin manual deletion via dashboard"
        });
        await archivedAccount.save();

        // 3. Delete the User
        await User.findByIdAndDelete(id);

        // 4. Clean up MongoDB detail records
        await Admin.deleteOne({ userId: id }); // Only if user was admin

        // A deleted companion must disappear from the public listing at once.
        invalidateCompanionsCache();

        res.status(200).json({
            message: "User deleted and archived successfully",
            deletedUserId: id
        });
    } catch (err) {
        console.error("[DeleteUser Error]:", err);
        res.status(500).json({ error: err.message });
    }
};

export const getDeletedAccounts = async (req, res) => {
    try {
        if (!['admin', 'superadmin'].includes(req.user.role)) {
            return res.status(403).json({ message: "Access denied" });
        }

        const accounts = await DeletedAccount.find()
            .populate({
                path: 'deletedBy',
                select: 'username email fullName displayName',
                strictPopulate: false
            })
            .sort({ deletedAt: -1, createdAt: -1 });

        const formatted = accounts.map(acc => {
            let deletedByDisplay = 'System Administrator';
            if (acc.deletedBy) {
                if (typeof acc.deletedBy === 'object') {
                    deletedByDisplay = acc.deletedBy.username || acc.deletedBy.fullName || acc.deletedBy.displayName || acc.deletedBy.email || 'Admin';
                } else {
                    deletedByDisplay = String(acc.deletedBy);
                }
            }

            const deletedAt = acc.deletedAt || acc.createdAt || new Date();
            const createdAt = acc.createdAt || acc.deletedAt || new Date();

            return {
                _id: acc._id,
                userId: acc.originalUserId || String(acc._id),
                originalUserId: acc.originalUserId || String(acc._id),
                username: acc.username || 'unknown',
                email: acc.email || 'unknown',
                role: acc.role || 'user',
                verification_status: 'deleted',
                is_verified: false,
                deletionReason: acc.deletionReason || 'Account deleted by administrator',
                deleted_by: deletedByDisplay,
                deleted_at: deletedAt,
                created_at: createdAt,
                profile: {
                    fullName: acc.fullName || acc.username || 'N/A',
                    phoneNumber: acc.phoneNumber || 'N/A',
                    categoryType: acc.categoryType || acc.role || 'user',
                    pricePerHour: acc.pricePerHour || 'N/A',
                    description: acc.deletionReason || 'Account deleted by administrator'
                }
            };
        });

        res.status(200).json({
            count: formatted.length,
            accounts: formatted
        });
    } catch (error) {
        console.error("Get deleted accounts error:", error);
        res.status(500).json({ message: "Server error fetching deleted accounts", error: error.message });
    }
};


