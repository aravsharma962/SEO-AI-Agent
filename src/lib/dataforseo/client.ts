import type { AuthorityData } from "@/types/audit";

const DATAFORSEO_BASE_URL = "https://api.dataforseo.com/v3";

function getAuthHeader(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

/**
 * Authority / off-page module (Part C). Pure data fetch, no LLM.
 *
 * If credentials are missing or the call fails, returns a stub marked
 * "unavailable" so the scoring engine treats authority as provisional per
 * A9 ("mark the authority score provisional or exclude it from the
 * normalized total rather than guessing") instead of throwing.
 */
export async function fetchAuthorityData(url: string): Promise<AuthorityData> {
  const auth = getAuthHeader();
  if (!auth) {
    return unavailable("not_requested");
  }

  try {
    const target = new URL(url).hostname;

    const response = await fetch(`${DATAFORSEO_BASE_URL}/backlinks/summary/live`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ target, include_subdomains: true }]),
    });

    if (!response.ok) {
      return unavailable("unavailable");
    }

    const payload = await response.json();
    const result = payload?.tasks?.[0]?.result?.[0];

    if (!result) {
      return unavailable("unavailable");
    }

    return {
      status: "ok",
      referring_domains: result.referring_domains ?? null,
      backlinks_total: result.backlinks ?? null,
      topical_backlink_relevance: null, // requires anchor/topic cross-analysis, not in v1
      top_anchor_texts: [],
      domain_authority_proxy: result.rank ?? null,
      branded_mentions: null,
    };
  } catch {
    return unavailable("unavailable");
  }
}

function unavailable(status: "unavailable" | "not_requested"): AuthorityData {
  return {
    status,
    referring_domains: null,
    backlinks_total: null,
    topical_backlink_relevance: null,
    top_anchor_texts: [],
    domain_authority_proxy: null,
    branded_mentions: null,
  };
}
