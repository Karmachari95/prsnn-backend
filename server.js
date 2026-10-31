import "./instrument.js";
import 'dotenv/config';
import app from "./src/app.js";
import connectMongo from "./src/config/mongo.js";

import http from 'http';
import initializeSocket from "./src/socket/index.js";

const PORT = process.env.PORT || 5002;

/**
 * Fail fast on misconfiguration.
 *
 * REQUIRED vars stop the boot with one clear line, rather than letting the
 * process start and then fail every request. OPTIONAL-but-important vars only
 * warn, so a missing payment or email key degrades one feature instead of
 * taking the whole API down.
 */
const REQUIRED_ENV = ['JWT_SECRET', 'FRONTEND_URL'];
if (!process.env.MONGO_DB_URI && !process.env.DATABASE_URL && !process.env.PG_DATABASE) {
  REQUIRED_ENV.push('DATABASE_URL');
}
const FEATURE_ENV = [
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'RESEND_API_KEY', 'EMAIL_FROM',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
];

const missingRequired = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingRequired.length) {
  console.error(`FATAL: missing required environment variable(s): ${missingRequired.join(', ')}`);
  process.exit(1);
}

const missingFeature = FEATURE_ENV.filter((k) => !process.env[k]);
if (missingFeature.length) {
  console.warn(`WARNING: missing environment variable(s): ${missingFeature.join(', ')}. ` +
               `Payments, email or uploads will fail until these are set.`);
}

import { initPostgres } from "./src/config/postgres.js";

// Initialize databases and start server
async function startServer() {
  try {
    await initPostgres();
  } catch (pgErr) {
    console.warn("PostgreSQL init warning:", pgErr.message);
  }

  if (process.env.MONGO_DB_URI) {
    try {
      await connectMongo();
    } catch (mongoErr) {
      console.warn("MongoDB init warning:", mongoErr.message);
    }
  }

  const server = http.createServer(app);
  initializeSocket(server);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
