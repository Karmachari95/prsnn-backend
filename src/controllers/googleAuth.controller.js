import User from "../models/User.js";
import { generateToken } from "../utils/token.js";
import crypto from "crypto";
import { hashPassword } from "../utils/hash.js";

/**
 * Google OAuth Controller
 * Verifies Google ID token against Google OAuth2 tokeninfo API
 * and creates or logs in the user seamlessly.
 */
export const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: "Google credential token is required" });
    }

    // Verify token directly with Google OAuth endpoint
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!googleRes.ok) {
      const errData = await googleRes.json().catch(() => ({}));
      return res.status(401).json({ message: "Invalid or expired Google token", details: errData });
    }

    const payload = await googleRes.json();
    const { email, name, picture, sub: googleId, email_verified } = payload;

    if (!email) {
      return res.status(400).json({ message: "Unable to retrieve email from Google profile" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check if user already exists
    let user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // 2. Create new user with Google profile
      const cleanBase = (name || email.split('@')[0])
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 15) || 'user';
      
      const uniqueUsername = `${cleanBase}_${Math.floor(1000 + Math.random() * 9000)}`;
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await hashPassword(randomPassword);

      user = new User({
        username: uniqueUsername,
        email: normalizedEmail,
        password: hashedPassword,
        fullName: name || 'PRSNN User',
        displayName: name || 'PRSNN User',
        role: 'user',
        isEmailVerified: true,
        verificationStatus: 'verified',
        profilePhotoUrl: picture || null,
        googleId: googleId,
        agreementAccepted: true,
      });

      await user.save();
    } else {
      // Existing user: ensure email is verified and update photo/googleId if missing
      if (!user.isEmailVerified && (email_verified === 'true' || email_verified === true)) {
        user.isEmailVerified = true;
      }
      if (picture && !user.profilePhotoUrl) {
        user.profilePhotoUrl = picture;
      }
      if (googleId && !user.googleId) {
        user.googleId = googleId;
      }
      await user.save();
    }

    // 3. Generate Auth JWT Token
    const token = generateToken({
      userId: user._id,
      role: user.role,
    });

    const isVerified = user.role === 'superadmin' || user.verificationStatus === 'verified';

    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        displayName: user.displayName || user.fullName || user.username,
        fullName: user.fullName || '',
        gender: user.gender || 'prefer_not_to_say',
        genderPreference: user.genderPreference || 'women_only',
        genderConsentAcknowledged: Boolean(user.genderConsentAcknowledged),
        agreementAccepted: Boolean(user.agreementAccepted),
        role: user.role,
        is_verified: isVerified,
        verification_status: user.verificationStatus,
        wantsToBeFellow: user.role === 'companion',
        profilePhoto: user.profilePhotoUrl,
      },
    });
  } catch (err) {
    console.error("GOOGLE AUTH ERROR:", err);
    return res.status(500).json({ message: "Google authentication failed: " + err.message });
  }
};
