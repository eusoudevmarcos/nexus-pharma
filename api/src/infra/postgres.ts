import pg from "pg";
import { config } from "../config.js";

export const postgres = new pg.Pool({
  connectionString: config.POSTGRES_URL,
  ssl: config.POSTGRES_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 20_000,
});

