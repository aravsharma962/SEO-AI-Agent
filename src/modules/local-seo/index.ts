import { callClaudeForJson } from "@/lib/anthropic/client";
import type { LocalSeoData } from "@/types/audit";

const SYSTEM_PROMPT = `You evaluate Local SEO signals on a page, across ANY industry with a local/physical presence
(medical practice, law firm, home services, retail location, restaurant, etc.): city in
title/H1/intro, a named provider (person) or business associated with the city, neighborhood
coverage, address/phone/map, local reviews/cost/FAQs, LocalBusiness (or industry-specific)
schema, and geo markup.

Rule (per spec A8 Step 7): reward MEANINGFUL local entity relationships (e.g. "Dr. X performs
gynecomastia surgery in Koramangala, Bangalore" or "Smith & Associates handles DUI cases in
Austin, TX"), not raw city-keyword repetition.

Respond with ONLY a JSON object:
{"city_in_title": bool, "city_in_h1": bool, "city_in_intro": bool, "provider_city_association": bool,
 "business_city_association": bool, "neighborhood_coverage": ["..."], "address_present": bool,
 "phone_present": bool, "map_or_directions_present": bool, "local_reviews": bool,
 "local_cost_info": bool, "local_faqs": bool, "local_business_schema": bool,
 "geo_markup": bool}
No text outside the JSON object.`;

/**
 * A8 Step 7: Local SEO Analysis. Layer: Claude (checklist-guided).
 */
export async function analyzeLocalSeo(params: {
  pageText: string;
  location?: string;
}): Promise<LocalSeoData> {
  const truncated = params.pageText.slice(0, 15000);
  const user = `Target location: ${params.location ?? "unspecified"}

Page content:
"""
${truncated}
"""`;

  return callClaudeForJson<LocalSeoData>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 1024,
  });
}
