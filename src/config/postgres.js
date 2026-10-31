import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Support both standard DATABASE_URL and discrete PG environment variables
const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
            ? false
            : { rejectUnauthorized: false }
    }
    : {
        host: process.env.PG_HOST || '127.0.0.1',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        database: process.env.PG_DATABASE || 'prsnn_db',
        user: process.env.PG_USER || process.env.USER || 'karimulla',
        password: process.env.PG_PASSWORD || '',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
});

export const query = (text, params) => pool.query(text, params);

export const initPostgres = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ PostgreSQL Connected Successfully');
        
        // Auto-run schema to ensure tables exist
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf8');
            await client.query(schemaSql);
            console.log('✅ PostgreSQL Schema initialized');
        }
        client.release();
    } catch (err) {
        console.error('⚠️ PostgreSQL Connection Failed:', err.message);
    }
};

export default {
    pool,
    query,
    initPostgres
};
