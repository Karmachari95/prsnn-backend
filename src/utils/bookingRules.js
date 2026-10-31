/**
 * bookingRules.js
 * Enforces operating hours (7:00 AM - 10:00 PM) and pricing calculation rules.
 */

export const OPERATING_HOURS = {
  START_MINUTES: 7 * 60,   // 07:00 AM = 420 mins
  END_MINUTES: 22 * 60,    // 10:00 PM = 1320 mins
  PLATFORM_FEE: 50,        // ₹50 platform fee
};

/**
 * Converts "HH:MM" string to minutes from midnight
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return -1;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return -1;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
};

/**
 * Converts minutes from midnight to "HH:MM"
 */
export const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Validates operating hours:
 * Must start at or after 07:00 AM and end at or before 10:00 PM (22:00).
 */
export const validateOperatingHours = (startTime, durationMinutes) => {
  const duration = parseInt(durationMinutes, 10);
  if (![30, 60, 90, 120, 180, 240].includes(duration)) {
    return {
      valid: false,
      message: 'Invalid duration. Allowed durations are 30, 60, 90, 120, 180, and 240 minutes.'
    };
  }

  const startMin = timeToMinutes(startTime);
  if (startMin === -1) {
    return { valid: false, message: 'Invalid start time format. Expected HH:MM.' };
  }

  if (startMin < OPERATING_HOURS.START_MINUTES) {
    return {
      valid: false,
      message: 'PRSNN bookings are available starting from 7:00 AM local time.'
    };
  }

  const endMin = startMin + duration;
  if (endMin > OPERATING_HOURS.END_MINUTES) {
    const latestAllowedMin = OPERATING_HOURS.END_MINUTES - duration;
    const latestTimeStr = minutesToTime(latestAllowedMin);
    return {
      valid: false,
      message: `Bookings must finish by 10:00 PM. For a ${duration}-minute session, the latest start time is ${latestTimeStr}.`
    };
  }

  return {
    valid: true,
    startMinutes: startMin,
    endMinutes: endMin,
    endTime: minutesToTime(endMin)
  };
};

/**
 * Calculate transparent server-side pricing
 */
export const calculateBookingPrice = ({ pricePerHour, durationMinutes }) => {
  const duration = parseInt(durationMinutes, 10) || 60;
  const rate = Number(pricePerHour) || 500;
  const basePrice = Math.round((duration / 60) * rate);
  const platformFee = OPERATING_HOURS.PLATFORM_FEE;
  const totalAmount = basePrice + platformFee;

  return {
    pricePerHour: rate,
    durationMinutes: duration,
    basePrice,
    platformFee,
    totalAmount,
    totalInPaise: totalAmount * 100
  };
};
