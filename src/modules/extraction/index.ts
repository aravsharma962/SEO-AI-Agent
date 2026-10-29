import * as cheerio from "cheerio";
import type {
  OnPageData,
  SchemaData,
  SocialMetadata,
  TechnicalData,
} from "@/types/audit";

export interface RawFetchResult {
  html: string;
  httpStatus: number;
  finalUrl: string;
}

/**
 * Layer: Code (TS + HTML parser). Deterministic page fetch — see Part B2.
 */
export async function fetchPage(url: string): Promise<RawFetchResult> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SEOAIAgent/0.1; +https://github.com/crisrosbert/SEO-AI-Agent)",
    },
    redirect: "follow",
  });

  const html = await response.text();

  return {
    html,
    httpStatus: response.status,
    finalUrl: response.url || url,
  };
}

/**
 * A7.1 — Basic on-page extraction. Deterministic, no LLM.
 */
export function extractOnPage(html: string, httpStatus: number): OnPageData {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || null;
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() || null;
  const robots = $('meta[name="robots"]').attr("content")?.trim() || null;

  const headings: OnPageData["headings"] = [];
  ([1, 2, 3, 4] as const).forEach((level) => {
    $(`h${level}`).each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push({ level, text });
    });
  });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : null;

  const publishedDate =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time[datetime]").first().attr("datetime") ||
    null;
  const modifiedDate =
    $('meta[property="article:modified_time"]').attr("content") || null;

  const author =
    $('meta[name="author"]').attr("content")?.trim() ||
    $('[rel="author"]').first().text().trim() ||
    null;

  return {
    title,
    title_length: title ? title.length : null,
    meta_description: metaDescription,
    meta_description_length: metaDescription ? metaDescription.length : null,
    canonical,
    robots,
    http_status: httpStatus,
    headings,
    word_count: wordCount,
    published_date: publishedDate,
    modified_date: modifiedDate,
    author,
    reviewer: null, // populated by E-E-A-T module ("content reviewed by" block detection)
    last_reviewed_date: null,
  };
}

const KNOWN_SCHEMA_TYPES = [
  "WebPage",
  "Article",
  "Organization",
  "LocalBusiness",
  "Product",
  "Service",
  "HowTo",
  "FAQPage",
  "BreadcrumbList",
  "VideoObject",
  "ImageObject",
  "Review",
  "AggregateRating",
  "Person",
  // Industry-specific types recognized alongside the generic ones above —
  // this list feeds a coverage ratio (schema present / KNOWN_SCHEMA_TYPE_COUNT),
  // it never gates or requires any specific type.
  "MedicalWebPage",
  "MedicalOrganization",
  "Hospital",
  "Physician",
  "LegalService",
  "FinancialService",
];

/**
 * A7 — Structured data (JSON-LD only for v1; microdata/RDFa deferred).
 */
export function extractSchema(html: string): SchemaData {
  const $ = cheerio.load(html);
  const typesPresent = new Set<string>();
  const properties: Record<string, unknown> = {};

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const graph = node["@graph"] ?? [node];
        for (const entry of graph) {
          const type = entry?.["@type"];
          const types = Array.isArray(type) ? type : [type];
          types.forEach((t: string) => {
            if (t) typesPresent.add(t);
          });
          Object.assign(properties, entry);
        }
      }
    } catch {
      // malformed JSON-LD — skip, don't fail the whole extraction
    }
  });

  const missingRecommended = KNOWN_SCHEMA_TYPES.filter(
    (t) => !typesPresent.has(t)
  );

  return {
    types_present: Array.from(typesPresent),
    properties,
    missing_recommended: missingRecommended,
  };
}

/**
 * A7 — Open Graph + Twitter/X card fields.
 */
export function extractSocialMetadata(html: string): SocialMetadata {
  const $ = cheerio.load(html);
  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};

  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr("property");
    const content = $(el).attr("content");
    if (property && content) openGraph[property] = content;
  });

  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name");
    const content = $(el).attr("content");
    if (name && content) twitter[name] = content;
  });

  return { open_graph: openGraph, twitter };
}

/**
 * A7 — Technical SEO signals extractable from static HTML alone. Fields
 * that require a headless browser or a CWV API (LCP/INP/CLS/TTFB, rendered
 * DOM size, JS-dependent content) are left null here and should be filled
 * in by a follow-up Lighthouse/PSI integration (see README "Known gaps").
 */
export function extractTechnical(
  html: string,
  httpStatus: number,
  robotsMeta: string | null
): TechnicalData {
  const $ = cheerio.load(html);

  const indexable =
    httpStatus >= 200 &&
    httpStatus < 300 &&
    !(robotsMeta ?? "").toLowerCase().includes("noindex");

  const hreflang = $('link[rel="alternate"][hreflang]')
    .map((_, el) => $(el).attr("hreflang") ?? "")
    .get()
    .filter(Boolean);

  const internalLinksCount = $("a[href]").length;

  return {
    indexable,
    robots_directives: robotsMeta ? robotsMeta.split(",").map((s) => s.trim()) : [],
    sitemap_listed: null,
    hreflang,
    mobile_friendly: $('meta[name="viewport"]').length > 0,
    js_dependent_content: null,
    core_web_vitals: null,
    images_optimized: null,
    lazy_loading: $("img[loading='lazy']").length > 0,
    dom_size: $("*").length,
    crawl_depth: null,
    internal_links_count: internalLinksCount,
    broken_links_count: null,
    redirect_chain_length: null,
    is_orphan: null,
  };
}
