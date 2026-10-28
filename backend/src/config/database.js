import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

const connectionConfig = env.DATABASE_URL
  ? { connectionString: env.DATABASE_URL }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };

const pool = new Pool({ ...connectionConfig, connectionTimeoutMillis: 3000 });

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error.code || error.message);
});

export default pool;
