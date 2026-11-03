/**
 * The name shown next to someone's reviews. People choose it (a nickname is fine); it must not
 * be, or contain, contact details. The database checks the same rules (public_name_ok, migration
 * 0010), so nobody can set an email as their name through Supabase's API either; keep in step.
 */
export const PUBLIC_NAME_MIN = 2;
export const PUBLIC_NAME_MAX = 40;

/** null when the name is fine, otherwise what to tell the person. */
export function publicNameProblem(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < PUBLIC_NAME_MIN) return `Use at least ${PUBLIC_NAME_MIN} characters.`;
  if (name.length > PUBLIC_NAME_MAX) return `Use at most ${PUBLIC_NAME_MAX} characters.`;
  if (!/\p{L}/u.test(name)) return "Include at least one letter.";
  if (name.includes("@")) return "Don't use an email address: this name is public.";
  if (/https?:|www\.|\.(com|net|org|br|pt|io|co)\b/i.test(name))
    return "Don't use a web address: this name is public.";
  if ((name.match(/\d/g) ?? []).length >= 7)
    return "Don't use a phone number: this name is public.";
  if (/\b(admin|moderator|ratedestinations|rate destinations|support)\b/i.test(name))
    return "That name is reserved. Pick another.";
  return null;
}

export function cleanPublicName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
