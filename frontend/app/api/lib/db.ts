import { Pool } from "pg";
import { Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { GoogleAuth } from "google-auth-library"; // Import GoogleAuth

declare global {
    // eslint-disable-next-line no-var
    var pgPool: Pool | undefined;
}


// Helper function to initialize the pool asynchronously
const getPool = async () => {
    let pool: Pool;

    if (global.pgPool) {
        return global.pgPool;
    }

    if (process.env.NODE_ENV !== "production") {
        // =====================
        // DEVELOPMENT
        // =====================
        pool = new Pool({
            host: "127.0.0.1",
            port: 5432,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
    } else {
        // =====================
        // PRODUCTION (VERCEL)
        // =====================
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
        }
        if (!process.env.INSTANCE_CONNECTION_NAME) {
            throw new Error("Missing INSTANCE_CONNECTION_NAME");
        }

        // 1. Parse the credentials directly from the environment variable
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

        // 2. Create a GoogleAuth instance in memory
        const auth = new GoogleAuth({
            credentials
        });

        // 3. Pass the auth instance to the Connector
        const connector = new Connector({ auth });

        const clientOpts = await connector.getOptions({
            instanceConnectionName: process.env.INSTANCE_CONNECTION_NAME,
            ipType: IpAddressTypes.PUBLIC,
        });

        pool = new Pool({
            ...clientOpts,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            max: 24,
        });
    }

    global.pgPool = pool;
    return pool;
};

export const pool = await getPool();