import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
export function createDb(databaseUrl: string) { if (!databaseUrl) throw new Error("DATABASE_URL is required"); const client = postgres(databaseUrl, { max: 10 }); return { db: drizzle(client, { schema }), client }; }
