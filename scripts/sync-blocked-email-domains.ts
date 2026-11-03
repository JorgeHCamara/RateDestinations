/**
 * Copy the throwaway-email list (src/data/disposable-email-domains.json) into the database's
 * blocked_email_domains table, which the rating trigger checks (migration 0010). Adds new
 * domains, removes ones no longer listed. Run by .github/workflows/overture-import.yml, or:
 *
 *   DATABASE_URL=... pnpm tsx scripts/sync-blocked-email-domains.ts
 *
 * To refresh the list itself from the community source (CC0):
 *   curl -s https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf
 * then rebuild the JSON (one lowercase domain per entry).
 */
import "dotenv/config";
import domains from "../src/data/disposable-email-domains.json";
import { getPool, query } from "../src/lib/db";

async function main() {
  const list = (domains as string[]).map((d) => d.trim().toLowerCase()).filter(Boolean);
  const added = await query<{ domain: string }>(
    `insert into blocked_email_domains (domain)
     select unnest($1::text[]) on conflict (domain) do nothing returning domain`,
    [list],
  );
  const removed = await query<{ domain: string }>(
    "delete from blocked_email_domains where domain <> all($1::text[]) returning domain",
    [list],
  );
  console.log(
    `blocked email domains: ${list.length} listed, ${added.length} added, ${removed.length} removed`,
  );
}

main()
  .then(() => getPool().end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
