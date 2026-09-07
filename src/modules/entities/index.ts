import { callClaudeForJson } from "@/lib/anthropic/client";
import type { Entity, EntityRelationship } from "@/types/audit";

const SYSTEM_PROMPT = `You extract SEO/topical entities and entity relationships from page content for a
comparative ranking diagnostic tool (medical/local service SEO focus).

Rules (must follow):
- Extract PRIMARY entity (the core condition/procedure/service), supporting entities
  (anatomy, tissue, technique, equipment, diagnostic tests, medications, risks, recovery
  concepts, doctor names/qualifications, hospitals/clinics, locations, cost, insurance,
  patient evidence), and their relationships.
- Represent relationships as Entity-Attribute-Value triples, e.g.
  {"entity": "Gynecomastia", "attribute": "treated_by_technique", "value": "gland excision",
  "depth": "full_section"}. depth is one of: mention | paragraph | subsection | full_section,
  based on how much content is dedicated to that relationship.
- Relationships matter more than raw entity counts. A page with fewer but tighter,
  well-supported relationships is more semantically focused than one with many loose,
  unconnected entity mentions.
- Do not invent entities, credentials, or relationships not evidenced in the text.

Respond with ONLY a JSON object of shape:
{"entities": [{"name": "...", "type": "condition_or_procedure|anatomy|tissue|technique|equipment|diagnostic_test|medication|risk|recovery_concept|doctor|hospital_or_clinic|location|cost|insurance|patient_evidence", "mentions": <int>}],
 "relationships": [{"entity": "...", "attribute": "...", "value": "...", "depth": "mention|paragraph|subsection|full_section"}]}
No text outside the JSON object.`;

export interface EntityExtractionResult {
  entities: Entity[];
  relationships: EntityRelationship[];
}

/**
 * A8 Step 3: Entity & Semantic Analysis (extraction half). Layer: Claude,
 * structured JSON output. Semantic proximity (cosine similarity via
 * pgvector) is computed separately in src/modules/semantic.
 */
export async function extractEntitiesAndRelationships(params: {
  targetKeyword: string;
  pageText: string;
}): Promise<EntityExtractionResult> {
  // Truncate to keep prompt cost bounded; the deterministic extraction
  // module already captured structural signals (headings, word count).
  const truncated = params.pageText.slice(0, 15000);

  const user = `Target keyword: "${params.targetKeyword}"

Page content:
"""
${truncated}
"""`;

  const result = await callClaudeForJson<EntityExtractionResult>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 4096,
  });

  return {
    entities: result.entities ?? [],
    relationships: result.relationships ?? [],
  };
}
