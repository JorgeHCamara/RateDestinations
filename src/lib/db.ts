import { Pool, types, type QueryResultRow } from "pg";
import { normalizeDatabaseUrl } from "./db-url";

// node-postgres returns NUMERIC and BIGINT as strings to avoid precision loss; our values are
// small scores and counts, so plain numbers are what the app wants.
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));

/**
 * Direct Postgres access for server code (Server Components, Server Actions, Route Handlers).
 *
 * In production DATABASE_URL should be the Supabase *transaction-mode pooler* URL (port 6543),
 * which is designed for serverless. Row Level Security still guards the public PostgREST API;
 * this connection runs as the database owner, so authorization is enforced in the server code
 * (every write checks the Supabase session first).
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("DATABASE_URL is not set");
    const { url, ssl } = normalizeDatabaseUrl(raw);
    pool = new Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX ?? 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      // Supabase's pooler presents a certificate from Supabase's own CA; encrypt without
      // verifying the chain (the standard setting for Supabase with node-postgres).
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
