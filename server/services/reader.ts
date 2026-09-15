/**
 * Fetch a web page and reduce it to clean, readable content for the shared
 * reading panel.
 *
 * Everything here treats the fetched document as hostile data: it is rendered
 * to a Grade 6 learner and summarised to a tutor model, so no markup, script,
 * or embedded instruction from the page may survive into either. Only plain
 * text, headings, links and image URLs come out the other side.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_DOWNLOAD_BYTES = 3_000_000;
const MAX_BLOCKS = 120;

export interface ReaderImage {
  src: string;
  alt: string;
}

export interface ReaderBlock {
  type: "heading" | "paragraph" | "list_item" | "quote";
  text: string;
}

export interface ReaderPage {
  url: string;
  site: string;
  title: string;
  byline: string | null;
  blocks: ReaderBlock[];
  images: ReaderImage[];
  truncated: boolean;
}

/** Only ordinary web pages, never internal addresses or odd schemes. */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That does not look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https pages can be opened.");
  }
  const host = url.hostname.toLowerCase();
  const blockedHost =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    // IPv4 private and loopback ranges, and IPv6 loopback/link-local.
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host.startsWith("[fe80:") ||
    host.startsWith("[fc") ||
    host.startsWith("[fd");
  if (blockedHost) throw new Error("That address is not reachable from here.");
  return url;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    mdash: "—",
    ndash: "–",
    hellip: "…",
    rsquo: "’",
    lsquo: "‘",
    ldquo: "“",
    rdquo: "”",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const code = entity[1]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop everything that could execute, style, or hide content. */
function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|canvas|iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
}

function absolute(src: string, base: URL): string | null {
  try {
    const resolved = new URL(src, base);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

export function extractReadable(html: string, url: URL): ReaderPage {
  const rawTitle =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ??
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ??
    url.hostname;
  const byline =
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? null;

  // Prefer the main article when the page marks one, so navigation chrome and
  // comment threads do not drown the actual reading.
  const body = stripNonContent(html);
  const article =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(body)?.[1] ??
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1] ??
    body;

  const blocks: ReaderBlock[] = [];
  const pattern = /<(h[1-4]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  let truncated = false;
  while ((match = pattern.exec(article)) !== null) {
    if (blocks.length >= MAX_BLOCKS) {
      truncated = true;
      break;
    }
    const tag = match[1].toLowerCase();
    const text = textOf(match[2]);
    // Single words and stray fragments are navigation, not reading.
    if (text.length < 3 || (tag === "li" && text.length < 12)) continue;
    blocks.push({
      type: tag.startsWith("h") ? "heading" : tag === "li" ? "list_item" : tag === "blockquote" ? "quote" : "paragraph",
      text: text.slice(0, 1_200),
    });
  }

  const images: ReaderImage[] = [];
  const imagePattern = /<img\b[^>]*>/gi;
  while ((match = imagePattern.exec(article)) !== null && images.length < 8) {
    const tag = match[0];
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || src.startsWith("data:")) continue;
    const resolved = absolute(src, url);
    if (!resolved) continue;
    const width = Number(/\bwidth=["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    // Tracking pixels and spacer icons are not illustrations.
    if (width > 0 && width < 120) continue;
    if (/sprite|icon|logo|avatar|pixel|tracking/i.test(resolved)) continue;
    images.push({ src: resolved, alt: textOf(/\balt=["']([^"']*)["']/i.exec(tag)?.[1] ?? "").slice(0, 200) });
  }

  return {
    url: url.toString(),
    site: url.hostname.replace(/^www\./, ""),
    title: textOf(rawTitle).slice(0, 200) || url.hostname,
    byline: byline ? textOf(byline).slice(0, 120) : null,
    blocks,
    images,
    truncated,
  };
}

export async function readPage(rawUrl: string): Promise<ReaderPage> {
  const url = assertSafeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identify honestly; some sites serve a simpler page to known readers.
        "User-Agent": "SmarticusReader/1.0 (classroom reading view)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === "AbortError"
        ? "That page took too long to answer."
        : "That page could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new Error(`That page returned ${response.status}.`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new Error("That address is not a readable web page.");

  const raw = await response.arrayBuffer();
  if (raw.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("That page is too large to read here.");
  const html = new TextDecoder("utf-8").decode(raw);
  // Redirects mean the final address may differ from the one asked for.
  return extractReadable(html, assertSafeUrl(response.url || url.toString()));
}

/** Compact, speakable summary of a page for the tutor model's tool output. */
export function summarizeForTutor(page: ReaderPage, maxChars = 900): string {
  const headings = page.blocks.filter((block) => block.type === "heading").slice(0, 3);
  const prose = page.blocks.filter((block) => block.type !== "heading").slice(0, 6);
  const parts = [
    `${page.title} — ${page.site}`,
    ...headings.map((block) => block.text),
    ...prose.map((block) => block.text),
  ];
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
