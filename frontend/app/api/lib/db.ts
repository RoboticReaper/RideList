import { Pool } from 'pg';

declare global {
    var pgPool: Pool | undefined;
}

export const pool =
    global.pgPool ??
    new Pool({
        host: '127.0.0.1',
        port: 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: false,
        max: 10,                 // max connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });

if (process.env.NODE_ENV !== 'production') {
    global.pgPool = pool;
}
