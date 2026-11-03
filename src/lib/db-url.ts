/**
 * Normalise a DATABASE_URL as pasted into a hosting dashboard. Common paste mistakes: surrounding
 * quotes, a leading `DATABASE_URL=`, stray whitespace. Also drops `sslmode`: the pg driver now
 * treats `sslmode=require` as full certificate verification and lets it override the `ssl` option,
 * which the Supabase pooler's certificate does not pass. SSL is configured in db.ts instead.
 */
export function normalizeDatabaseUrl(raw: string): { url: string; ssl: boolean } {
  let value = raw.trim();
  if (value.startsWith("DATABASE_URL=")) value = value.slice("DATABASE_URL=".length).trim();
  value = value.replace(/^(['"])(.*)\1$/, "$2").trim();
  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new Error(
      "DATABASE_URL must be a postgresql:// connection string (check for quotes or extra text)",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid URL; if the password has special characters, URL-encode them",
    );
  }
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  const ssl =
    /supabase\.(co|com)$/.test(url.hostname) || (sslmode !== null && sslmode !== "disable");
  return { url: url.toString(), ssl };
}
