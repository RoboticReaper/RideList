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
        // PRODUCTION (ORANGEPI)
        const ca = process.env.DB_CA_BASE64;
        const cert = process.env.DB_CERT_BASE64
        const key = process.env.DB_KEY_BASE64
        if (!ca) {
            throw new Error("Missing DB_CA_BASE64");
        }
        if (!cert) {
            throw new Error("Missing DB_CERT_BASE64");
        }
        if (!key) {
            throw new Error("Missing DB_KEY_BASE64");
        }
        const sslConfig = {
            rejectUnauthorized: true,
            ca: Buffer.from(ca, 'base64').toString('utf-8'),
            cert: Buffer.from(cert, 'base64').toString('utf-8'),
            key: Buffer.from(key, 'base64').toString('utf-8'),
        }

        const db_url = process.env.DATABASE_URL
        if (!db_url) {
            throw new Error("Missing DATABASE_URL");
        }

        pool = new Pool({
            connectionString: db_url,
            ssl: sslConfig,
            database: process.env.DB_NAME,
            max: 24,
        })



        // =====================
        // PRODUCTION (VERCEL)
        // =====================
        // if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        //     throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS_JSON");
        // }
        // if (!process.env.INSTANCE_CONNECTION_NAME) {
        //     throw new Error("Missing INSTANCE_CONNECTION_NAME");
        // }

        // // 1. Parse the credentials directly from the environment variable
        // const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

        // const auth = new GoogleAuth({
        //     credentials,
        //     // REQUIRED: The connector needs this specific scope to find your DB IP
        //     scopes: ['https://www.googleapis.com/auth/sqlservice.admin'],
        //     // REQUIRED: Explicitly pass the project ID from the JSON
        //     projectId: credentials.project_id,
        // });

        // // 3. Pass the auth instance to the Connector
        // const connector = new Connector({ auth });

        // const clientOpts = await connector.getOptions({
        //     instanceConnectionName: process.env.INSTANCE_CONNECTION_NAME,
        //     ipType: IpAddressTypes.PUBLIC,
        // });

        // pool = new Pool({
        //     ...clientOpts,
        //     user: process.env.DB_USER,
        //     password: process.env.DB_PASSWORD,
        //     database: process.env.DB_NAME,
        //     max: 24,
        // });
    }


    global.pgPool = pool;
    return pool;
};

export const pool = await getPool();