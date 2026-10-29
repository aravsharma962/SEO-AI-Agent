import { callClaudeForJson } from "@/lib/anthropic/client";
import type { ContentArchitecture, Entity, EntityRelationship } from "@/types/audit";

const SYSTEM_PROMPT = `You extract SEO/topical entities, entity relationships, and content-section labels from
a page's content for a comparative ranking diagnostic tool. This tool audits pages across ANY
industry — medical, financial, legal, SaaS, e-commerce, home services, education, etc. — so
labels must fit whatever the page is actually about, not assume a specific vertical.

Rules (must follow):
- Extract the PRIMARY entity (the core subject: the condition/procedure, product/service, legal
  matter, financial instrument — whatever the page is fundamentally about), supporting entities,
  and their relationships. Use ONLY these entity types:
  core_subject | component_or_aspect | method_or_technique | tool_or_resource |
  evaluation_or_test | risk_or_limitation | outcome_or_benefit | person_or_expert |
  organization | location | cost_or_pricing | coverage_or_regulatory | user_evidence
- Represent relationships as Entity-Attribute-Value triples, e.g.
  {"entity": "Gynecomastia", "attribute": "treated_by_technique", "value": "gland excision",
  "depth": "full_section"}, or {"entity": "Term Life Insurance", "attribute": "requires",
  "value": "medical exam", "depth": "paragraph"}. depth is one of: mention | paragraph |
  subsection | full_section, based on how much content is dedicated to that relationship.
- Relationships matter more than raw entity counts. A page with fewer but tighter,
  well-supported relationships is more semantically focused than one with many loose,
  unconnected entity mentions.
- Do not invent entities, credentials, or relationships not evidenced in the text.
- Also label each provided heading with a short canonical content-section slug you choose
  (e.g. "intro", "pricing", "how_it_works", "risks", "eligibility", "case_studies", "faqs",
  "author_bio", "reviews", "cta") — pick whatever slugs actually fit this page's structure and
  industry; reuse the SAME slug across headings that serve the same structural role so gap
  analysis can compare pages by section. Use "unclassified" only if a heading truly doesn't fit
  any content role.

Respond with ONLY a JSON object of shape:
{"entities": [{"name": "...", "type": "<one of the allowed types above>", "mentions": <int>}],
 "relationships": [{"entity": "...", "attribute": "...", "value": "...", "depth": "mention|paragraph|subsection|full_section"}],
 "sections_by_heading": [{"heading": "<verbatim heading text>", "section": "<canonical slug>"}]}
No text outside the JSON object.`;

export interface EntityExtractionResult {
  entities: Entity[];
  relationships: EntityRelationship[];
  content: ContentArchitecture;
}

/**
 * A8 Step 3: Entity & Semantic Analysis (extraction half), extended to also
 * absorb content-section labeling (formerly a fixed medical-keyword list in
 * src/modules/content-architecture) — canonical section slugs vary too much
 * by industry for a static keyword table, so Claude assigns them in the same
 * call. Downstream scoring/gap-classification only care about the
 * DISTRIBUTION of section labels across compared pages, never the specific
 * values, so this doesn't require any changes there. Semantic proximity
 * (cosine similarity via pgvector) is computed separately in
 * src/modules/semantic.
 */
export async function extractEntitiesAndRelationships(params: {
  targetKeyword: string;
  pageText: string;
  headings: { level: number; text: string }[];
}): Promise<EntityExtractionResult> {
  // Truncate to keep prompt cost bounded; the deterministic extraction
  // module already captured structural signals (headings, word count).
  const truncated = params.pageText.slice(0, 15000);
  const headingTexts = params.headings.map((h) => h.text);

  const user = `Target keyword: "${params.targetKeyword}"

Headings on this page (label each one):
${JSON.stringify(headingTexts)}

Page content:
"""
${truncated}
"""`;

  const result = await callClaudeForJson<{
    entities?: Entity[];
    relationships?: EntityRelationship[];
    sections_by_heading?: { heading: string; section: string }[];
  }>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 8192,
  });

  const sectionsByHeading = result.sections_by_heading ?? [];
  const sectionsPresent = Array.from(
    new Set(sectionsByHeading.map((s) => s.section).filter((s) => s !== "unclassified"))
  );

  return {
    entities: result.entities ?? [],
    relationships: result.relationships ?? [],
    content: { sections_present: sectionsPresent, sections_by_heading: sectionsByHeading },
  };
}
