/**
 * Applies supabase/migrations/*.sql in filename order against DATABASE_URL,
 * recording applied files in schema_migrations. Idempotent.
 *
 * For hosted Supabase you can use `supabase db push` instead; this runner exists so the
 * schema can be applied to any Postgres (local dev, CI) without Docker.
 *
 *   DATABASE_URL=postgres://... pnpm db:migrate
 *   pnpm db:migrate --with-local-shim   # also applies scripts/local-auth-shim.sql first
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const root = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(root, "supabase", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const withShim = process.argv.includes("--with-local-shim");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (withShim) {
      const shim = await readFile(path.join(root, "scripts", "local-auth-shim.sql"), "utf8");
      await client.query(shim);
      console.log("applied local auth shim");
    }
    await client.query(
      `create table if not exists schema_migrations (
         filename text primary key, applied_at timestamptz not null default now())`,
    );
    const applied = new Set(
      (await client.query<{ filename: string }>("select filename from schema_migrations")).rows.map(
        (r) => r.filename,
      ),
    );
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip    ${file}`);
        continue;
      }
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [file]);
        await client.query("commit");
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
