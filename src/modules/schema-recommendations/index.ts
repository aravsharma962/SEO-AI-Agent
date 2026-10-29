import { callClaudeForJson } from "@/lib/anthropic/client";
import type { ContentCategory, Entity, OnPageData, SchemaRecommendation } from "@/types/audit";

const SYSTEM_PROMPT = `You recommend schema.org structured data (JSON-LD) additions for a single page. This tool
audits pages across ANY industry, so judge relevance from the actual page data given — do not
apply a generic checklist (e.g. never recommend Recipe schema for a legal-services page, or
MedicalWebPage schema for a SaaS pricing page).

Rules (must follow):
- Recommend AT MOST 3 schema types: only ones genuinely relevant to THIS page's actual content
  and content_category, and only if not already present.
- For each, produce a ready-to-paste JSON-LD object using ONLY values evidenced in the supplied
  page data (title, author, dates, entities, headings). Where schema.org expects a property the
  data doesn't provide (e.g. aggregateRating, price, reviewCount), OMIT that property entirely —
  never invent a rating, price, review count, or credential that isn't in the given data.
- Always include "@context": "https://schema.org" and the correct "@type" in each json_ld object.

Respond with ONLY a JSON object:
{"recommendations": [{"schema_type": "...", "json_ld": {"@context": "https://schema.org", "@type": "...", ...}, "rationale": "..."}]}
No text outside the JSON object.`;

/**
 * Generates real, ready-to-paste JSON-LD for schema types judged relevant
 * to this specific page — distinct from SchemaData.missing_recommended
 * (src/modules/extraction), which is just a raw "not present" coverage list
 * with no relevance judgment or generated markup.
 */
export async function recommendSchema(params: {
  onPage: OnPageData;
  entities: Entity[];
  contentCategory: ContentCategory;
  typesPresent: string[];
}): Promise<SchemaRecommendation[]> {
  const user = `Content category: ${params.contentCategory}
Schema types already present on this page: ${JSON.stringify(params.typesPresent)}

Page data:
${JSON.stringify(
  {
    title: params.onPage.title,
    meta_description: params.onPage.meta_description,
    author: params.onPage.author,
    reviewer: params.onPage.reviewer,
    published_date: params.onPage.published_date,
    modified_date: params.onPage.modified_date,
    headings: params.onPage.headings.slice(0, 20),
  },
  null,
  2
)}

Top entities on this page: ${JSON.stringify(params.entities.slice(0, 20))}`;

  const result = await callClaudeForJson<{ recommendations?: SchemaRecommendation[] }>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 3072,
  });

  return result.recommendations ?? [];
}
