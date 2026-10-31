import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.PG_HOST || '127.0.0.1',
            port: parseInt(process.env.PG_PORT || '5432', 10),
            database: process.env.PG_DATABASE || 'prsnn_db',
            user: process.env.PG_USER || process.env.USER || 'karimulla',
            password: process.env.PG_PASSWORD || '',
        }
);

async function seed() {
    const client = await pool.connect();
    try {
        console.log('Seeding PostgreSQL with live PRSNN data...');
        const jsonPath = path.join(__dirname, '../data-live-companions.json');
        if (!fs.existsSync(jsonPath)) {
            throw new Error(`Data file not found at: ${jsonPath}`);
        }

        const raw = fs.readFileSync(jsonPath, 'utf8');
        const companions = JSON.parse(raw);
        console.log(`Found ${companions.length} live companions to migrate into PostgreSQL.`);

        let inserted = 0;
        let updated = 0;

        for (const item of companions) {
            const id = item.id || item.userId || ('comp_' + Math.random().toString(36).substring(2, 9));
            const username = item.username || `companion_${id.substring(0, 6)}`;
            const email = item.email || `${username}@prsnn.live`;
            const fullName = item.fullName || username;
            const displayName = fullName.split(' ')[0] || fullName;
            const description = item.description || '';
            const pricePerHour = Number(item.pricePerHour) || 399;
            const city = item.city || 'Bangalore';
            const area = item.area || '';
            const profilePhotoUrl = item.profilePhoto || '';
            const tags = JSON.stringify(item.tags || []);
            const availability = JSON.stringify(item.availability || {
                monday: item.monday_availability ?? true,
                tuesday: item.tuesday_availability ?? true,
                wednesday: item.wednesday_availability ?? true,
                thursday: item.thursday_availability ?? true,
                friday: item.friday_availability ?? true,
                saturday: item.saturday_availability ?? true,
                sunday: item.sunday_availability ?? true,
            });
            const startTime = item.start_time || '09:00';
            const endTime = item.end_time || '21:00';

            const query = `
                INSERT INTO users (
                    id, username, email, role, verification_status, is_email_verified,
                    display_name, full_name, description, price_per_hour,
                    city, area, profile_photo_url, tags, availability,
                    start_time, end_time, gender, gender_preference,
                    gender_consent_acknowledged, agreement_accepted, rating, review_count, is_available
                ) VALUES (
                    $1, $2, $3, 'companion', 'verified', true,
                    $4, $5, $6, $7,
                    $8, $9, $10, $11, $12,
                    $13, $14, 'woman', 'women_only',
                    true, true, 5.0, 12, true
                )
                ON CONFLICT (id) DO UPDATE SET
                    username = EXCLUDED.username,
                    email = EXCLUDED.email,
                    display_name = EXCLUDED.display_name,
                    full_name = EXCLUDED.full_name,
                    description = EXCLUDED.description,
                    price_per_hour = EXCLUDED.price_per_hour,
                    city = EXCLUDED.city,
                    area = EXCLUDED.area,
                    profile_photo_url = EXCLUDED.profile_photo_url,
                    tags = EXCLUDED.tags,
                    availability = EXCLUDED.availability,
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    updated_at = NOW()
                RETURNING id;
            `;

            const res = await client.query(query, [
                id, username, email, displayName, fullName, description, pricePerHour,
                city, area, profilePhotoUrl, tags, availability, startTime, endTime
            ]);

            if (res.rowCount > 0) {
                inserted++;
            }
        }

        console.log(`✅ Successfully seeded/updated ${inserted} companion records in PostgreSQL.`);

        // Also ensure a default demo user exists for testing
        const demoUserQuery = `
            INSERT INTO users (
                id, username, email, role, verification_status, is_email_verified,
                display_name, full_name, city, gender, gender_preference,
                gender_consent_acknowledged, agreement_accepted
            ) VALUES (
                'user_demo_01', 'demo_user', 'user@prsnn.com', 'user', 'verified', true,
                'Demo', 'Demo User', 'Bangalore', 'woman', 'women_only',
                true, true
            )
            ON CONFLICT (id) DO NOTHING;
        `;
        await client.query(demoUserQuery);
        console.log('✅ Demo user seeded.');

        // Verify counts
        const countRes = await client.query('SELECT COUNT(*) as total FROM users');
        console.log(`Total users in PostgreSQL: ${countRes.rows[0].total}`);

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
