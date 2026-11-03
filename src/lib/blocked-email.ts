import "server-only";
import domains from "@/data/disposable-email-domains.json";

/**
 * Throwaway email services (Mailinator, 10minutemail, …): the community-maintained list at
 * github.com/disposable-email-domains/disposable-email-domains (CC0), kept in
 * src/data/disposable-email-domains.json. The sign-in form refuses them; the database refuses
 * ratings from such accounts too (blocked_email_domains, synced from the same file by the
 * scheduled workflow), so the check can't be skipped by calling Supabase directly.
 */
let blocked: Set<string> | null = null;

/** True when the address, or any parent of its domain (x.mailinator.com), is a throwaway service. */
export function isThrowawayEmail(email: string): boolean {
  blocked ??= new Set(domains as string[]);
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (blocked.has(parts.slice(i).join("."))) return true;
  return false;
}
