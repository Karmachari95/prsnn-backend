

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

// Verified female companions to guarantee safety & gender balance
export const FEMALE_COMPANIONS = [
  {
    id: "6ab7001a1111111111111001",
    userId: "6ab7001a1111111111111001",
    _id: "6ab7001a1111111111111001",
    username: "priya_blr",
    displayName: "Priya Sharma",
    fullName: "Priya Sharma",
    city: "Bangalore",
    area: "Indiranagar, Koramangala",
    pricePerHour: 499,
    gender: "woman",
    profilePhoto: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&auto=format&fit=crop&q=80",
    profilePhotoUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&auto=format&fit=crop&q=80",
    tags: ["Sit With Me", "Don't Go Alone", "Explore Together", "Cafe Hopping", "Study Buddy", "Silence", "Quiet", "Reading", "Walking"],
    description: "Gentle presence for study sessions, quiet café reading, or someone calm to accompany you to social gatherings.",
    availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    monday_availability: true, tuesday_availability: true, wednesday_availability: true, thursday_availability: true, friday_availability: true, saturday_availability: true, sunday_availability: true,
    start_time: "09:00", end_time: "20:00"
  },
  {
    id: "6ab7001a1111111111111002",
    userId: "6ab7001a1111111111111002",
    _id: "6ab7001a1111111111111002",
    username: "ananya_bom",
    displayName: "Ananya Sen",
    fullName: "Ananya Sen",
    city: "Mumbai",
    area: "Bandra, Juhu, Khar",
    pricePerHour: 549,
    gender: "woman",
    profilePhoto: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=800&auto=format&fit=crop&q=80",
    profilePhotoUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=800&auto=format&fit=crop&q=80",
    tags: ["Don't Go Alone", "Explore Together", "Event Companion", "Cafe Hopping", "Plus One", "Foodie", "Walking"],
    description: "Friendly companion for art gallery visits, weekend brunches, exploring indie bookshops or quiet public walks.",
    availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    monday_availability: true, tuesday_availability: true, wednesday_availability: true, thursday_availability: true, friday_availability: true, saturday_availability: true, sunday_availability: true,
    start_time: "10:00", end_time: "21:00"
  },
  {
    id: "6ab7001a1111111111111003",
    userId: "6ab7001a1111111111111003",
    _id: "6ab7001a1111111111111003",
    username: "meera_che",
    displayName: "Meera Iyer",
    fullName: "Meera Iyer",
    city: "Chennai",
    area: "Besant Nagar, Adyar",
    pricePerHour: 449,
    gender: "woman",
    profilePhoto: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80",
    profilePhotoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&auto=format&fit=crop&q=80",
    tags: ["Sit With Me", "Be Around", "Silence", "Study Buddy", "Reading", "Quiet", "Work Companion"],
    description: "Calm, non-intrusive focus partner. Ideal for coworking in libraries, reading by the beach promenade, or quiet presence.",
    availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    monday_availability: true, tuesday_availability: true, wednesday_availability: true, thursday_availability: true, friday_availability: true, saturday_availability: true, sunday_availability: true,
    start_time: "08:00", end_time: "19:00"
  },
  {
    id: "6ab7001a1111111111111004",
    userId: "6ab7001a1111111111111004",
    _id: "6ab7001a1111111111111004",
    username: "riya_del",
    displayName: "Riya Kapoor",
    fullName: "Riya Kapoor",
    city: "Delhi",
    area: "Hauz Khas, Connaught Place",
    pricePerHour: 599,
    gender: "woman",
    profilePhoto: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80",
    profilePhotoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80",
    tags: ["Explore Together", "Don't Go Alone", "Shopping", "Sightseeing", "Foodie", "Walking"],
    description: "Warm, respectful companion for heritage walks in old city gardens, flea markets, exhibitions or museum days.",
    availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    monday_availability: true, tuesday_availability: true, wednesday_availability: true, thursday_availability: true, friday_availability: true, saturday_availability: true, sunday_availability: true,
    start_time: "09:30", end_time: "20:30"
  },
  {
    id: "6ab7001a1111111111111005",
    userId: "6ab7001a1111111111111005",
    _id: "6ab7001a1111111111111005",
    username: "ayesha_hyd",
    displayName: "Ayesha Khan",
    fullName: "Ayesha Khan",
    city: "Hyderabad",
    area: "Jubilee Hills, Banjara Hills",
    pricePerHour: 499,
    gender: "woman",
    profilePhoto: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80",
    profilePhotoUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80",
    tags: ["Sit With Me", "Don't Go Alone", "Cafe Hopping", "Silence", "Sitting", "Plus One"],
    description: "Friendly, grounded companion who makes quiet spaces feel comfortable and social gatherings much less intimidating.",
    availability: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    monday_availability: true, tuesday_availability: true, wednesday_availability: true, thursday_availability: true, friday_availability: true, saturday_availability: true, sunday_availability: true,
    start_time: "10:00", end_time: "21:00"
  }
];

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

        // Combine MongoDB verified companions with curated female companions
        const combined = [...FEMALE_COMPANIONS, ...mappedMongo];
        
        let filteredResult = combined;
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

        if (user && user.role === 'companion' && user.verificationStatus === 'verified') {
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
        }

        const match = FEMALE_COMPANIONS.find(f => f.id === id || f.userId === id || f.username === id);
        if (match) {
            return res.status(200).json(match);
        }

        return res.status(404).json({ message: 'Companion not found or not verified' });
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
