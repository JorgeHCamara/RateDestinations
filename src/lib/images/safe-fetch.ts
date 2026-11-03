/**
 * Fetch for URLs that come from map data (a place's website, the image it names). Anyone can edit
 * that data, so the server must never be pointed at itself or a private network: every hop
 * (redirects included) must be http(s) on a default port and resolve to public addresses only.
 * Responses are cut off at `maxBytes`.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type LookupFn = (host: string) => Promise<string[]>;

const defaultLookup: LookupFn = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return /^(fc|fd|fe[89ab]|ff)/.test(v6);
}

export class BlockedUrlError extends Error {}

/** Throws BlockedUrlError unless the URL is a public http(s) address. */
export async function assertPublicUrl(raw: string, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("not a URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new BlockedUrlError("not http(s)");
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new BlockedUrlError("non-default port");
  if (url.username || url.password) throw new BlockedUrlError("credentials in URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    throw new BlockedUrlError("private host");
  const addresses = isIP(host) ? [host] : await lookup(host).catch(() => []);
  if (!addresses.length) throw new BlockedUrlError("host does not resolve");
  if (addresses.some(isPrivateAddress)) throw new BlockedUrlError("private address");
  return url;
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
};

/** GET with redirects followed by hand (each hop checked). Returns the final URL and up to maxBytes of body. */
export async function safeFetch(
  raw: string,
  {
    timeoutMs = 6_000,
    maxBytes = 512 * 1024,
    headers = {},
    fetchImpl = fetch,
    lookup,
  }: SafeFetchOptions = {},
): Promise<{ url: string; status: number; contentType: string; body: Uint8Array }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const url = await assertPublicUrl(current, lookup);
    const res = await fetchImpl(url, { redirect: "manual", signal, headers });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel().catch(() => {});
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    const body = await readCapped(res, maxBytes);
    return {
      url: url.toString(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body,
    };
  }
  throw new BlockedUrlError("too many redirects");
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, out.length - offset);
    out.set(part, offset);
    offset += part.length;
    if (offset >= out.length) break;
  }
  return out;
}
