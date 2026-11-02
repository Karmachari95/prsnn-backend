

import User from '../models/User.js';

/**
 * In-memory cache for companion listings.
 *
 * Keyed by page+limit: a single shared slot meant the first caller's page size
 * was served to everyone.
 *
 * NOTE: this is per-process. With more than one server instance the caches
 * diverge and users see different listings depending on which instance answers.
 * Move to Redis before scaling out (see prssn-document R14).
 */
const companionsCache = new Map();
const CACHE_DURATION = 60 * 1000; // 1 minute

/**
 * Drop cached companion listings.
 *
 * Must be called by anything that changes who appears in the list or what they
 * look like: verification decisions, companion onboarding, profile edits and
 * account deletion. Without this a newly approved companion stays invisible
 * until the entry expires.
 */
export const invalidateCompanionsCache = () => {
    companionsCache.clear();
};

/**
 * Fetch all verified companions with pagination and caching
 */
export const getAllCompanions = async (req, res) => {
    try {
        // Pagination support (optional, for future use)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100; // Default to 100, but allow override
        const skip = (page - 1) * limit;

        const cityFilter = req.query.city ? req.query.city.trim() : null;
        const genderFilter = req.query.gender ? req.query.gender.trim() : null;

        // Check cache first — scoped to page, limit, city and gender
        const cacheKey = `${page}:${limit}:${cityFilter || 'all'}:${genderFilter || 'all'}`;
        const now = Date.now();
        const cached = companionsCache.get(cacheKey);
        if (cached && (now - cached.timestamp) < CACHE_DURATION) {
            return res.status(200).json(cached.data);
        }

        const query = { 
            role: 'companion', 
            verificationStatus: 'verified' 
        };

        if (cityFilter) {
            query.city = { $regex: new RegExp(`^${cityFilter}$`, 'i') };
        }
        if (genderFilter) {
            query.gender = genderFilter;
        }

        // Optimized query with lean() and indexed compound fields
        const companions = await User.find(query)
        .select('username displayName fullName profilePhotoUrl description pricePerHour city area tags availability startTime endTime gender')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
        
        // Map MongoDB companions to frontend structure
        const mappedMongo = companions.map(f => ({
            id: f._id,
            userId: f._id,
            _id: f._id,
            username: f.username,
            displayName: f.displayName || f.fullName || f.username,
            fullName: f.fullName || f.displayName || f.username,
            profilePhoto: f.profilePhotoUrl,
            profilePhotoUrl: f.profilePhotoUrl,
            description: f.description,
            pricePerHour: f.pricePerHour,
            gender: f.gender || 'man',
            city: f.city,
            area: f.area,
            tags: f.tags || [],
            availability: f.availability,
            monday_availability: f.availability?.monday,
            tuesday_availability: f.availability?.tuesday,
            wednesday_availability: f.availability?.wednesday,
            thursday_availability: f.availability?.thursday,
            friday_availability: f.availability?.friday,
            saturday_availability: f.availability?.saturday,
            sunday_availability: f.availability?.sunday,
            start_time: f.startTime,
            end_time: f.endTime
        }));

        let filteredResult = mappedMongo;
        if (genderFilter === 'women_only' || genderFilter === 'woman' || genderFilter === 'female') {
            filteredResult = filteredResult.filter(c => c.gender === 'woman' || c.gender === 'female');
        } else if (genderFilter === 'men_only' || genderFilter === 'man' || genderFilter === 'male') {
            filteredResult = filteredResult.filter(c => c.gender === 'man' || c.gender === 'male');
        }

        if (cityFilter) {
            filteredResult = filteredResult.filter(c => c.city && c.city.toLowerCase() === cityFilter.toLowerCase());
        }

        // Update cache
        companionsCache.set(cacheKey, { data: filteredResult, timestamp: now });

        res.status(200).json(filteredResult);
    } catch (error) {
        console.error('Error fetching companions:', error);
        res.status(500).json({ message: 'Server error fetching companions' });
    }
};

/**
 * Fetch a specific companion by ID
 */
export const getCompanionById = async (req, res) => {
    try {
        const { id } = req.params;
        
        let user = null;
        if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
            user = await User.findById(id)
                .select('username email profilePhotoUrl fullName description pricePerHour city area tags availability startTime endTime verificationStatus role gender')
                .lean();
        }

        if (!user || user.role !== 'companion' || user.verificationStatus !== 'verified') {
            return res.status(404).json({ message: 'Companion not found or not verified' });
        }

        return res.status(200).json({
            ...user,
            id: user._id,
            userId: user._id,
            gender: user.gender || 'man',
            profilePhoto: user.profilePhotoUrl,
            monday_availability: user.availability?.monday,
            tuesday_availability: user.availability?.tuesday,
            wednesday_availability: user.availability?.wednesday,
            thursday_availability: user.availability?.thursday,
            friday_availability: user.availability?.friday,
            saturday_availability: user.availability?.saturday,
            sunday_availability: user.availability?.sunday,
            start_time: user.startTime,
            end_time: user.endTime,
            price_per_hour: user.pricePerHour
        });
    } catch (error) {
        console.error('Error fetching companion:', error);
        res.status(500).json({ message: 'Server error fetching companion' });
    }
};

/**
 * Search companions by name or description
 */
export const searchCompanions = async (req, res) => {
    try {
        const { query } = req.params;
        const regex = new RegExp(query, 'i');

        const companions = await User.find({
            role: 'companion',
            verificationStatus: 'verified',
            $or: [
                { fullName: regex },
                { username: regex },
                { description: regex },
                { tags: regex }
            ]
        })
        .select('username email profilePhotoUrl fullName description pricePerHour city area tags availability startTime endTime')
        .sort({ createdAt: -1 })
        .limit(50) // Limit search results to 50
        .lean();

        res.status(200).json(companions);
    } catch (error) {
        console.error('Error searching companions:', error);
        res.status(500).json({ message: 'Server error searching companions' });
    }
};
