import type { ExtractedPage, ModuleScore, ScoreModule } from "@/types/audit";
import { KNOWN_SCHEMA_TYPE_COUNT } from "./constants";
import { semanticProximity } from "@/modules/semantic";

const DEPTH_WEIGHT: Record<string, number> = {
  mention: 1,
  paragraph: 2,
  subsection: 3,
  full_section: 4,
};

function boolCoverage(flags: (boolean | null)[]): number {
  const known = flags.filter((f): f is boolean => f !== null);
  if (known.length === 0) return 0;
  return (known.filter(Boolean).length / known.length) * 100;
}

/**
 * v1 deterministic module scorers. These turn each module's extracted data
 * into a 0-100 "raw score" per A9. Heuristics are intentionally simple and
 * transparent so they can be tuned against real client data (Part D1
 * Phase 5/8) without touching the orchestration or persistence layers.
 *
 * Content architecture and entity coverage are scored RELATIVE to the
 * other pages in the same audit run (the union of what's present across
 * all compared pages) — there is no absolute "complete" page, only
 * "complete relative to what's currently ranking" (spec A2/A8 Step 2).
 */
export function scoreContentArchitecture(
  page: ExtractedPage,
  allPages: ExtractedPage[]
): ModuleScore {
  const unionSections = new Set<string>();
  allPages.forEach((p) => p.content.sections_present.forEach((s) => unionSections.add(s)));

  const rawScore =
    unionSections.size === 0
      ? 0
      : (page.content.sections_present.length / unionSections.size) * 100;

  return {
    module: "content_architecture",
    raw_score: Math.round(rawScore),
    weight: 0, // filled in by the weighting step
    provisional: false,
    confidence: "high",
    notes: "Coverage relative to the union of sections present across all compared pages.",
  };
}

export function scoreEntitiesSemantic(
  page: ExtractedPage,
  allPages: ExtractedPage[],
  targetKeywordEmbedding?: number[] | null
): ModuleScore {
  const unionEntities = new Set<string>();
  allPages.forEach((p) => p.entities.forEach((e) => unionEntities.add(e.name.toLowerCase())));

  const entityCoverage =
    unionEntities.size === 0
      ? 0
      : (page.entities.filter((e) => unionEntities.has(e.name.toLowerCase())).length /
          unionEntities.size) *
        100;

  const avgDepth =
    page.entity_relationships.length === 0
      ? 0
      : page.entity_relationships.reduce(
          (sum, r) => sum + (DEPTH_WEIGHT[r.depth] ?? 1),
          0
        ) /
        page.entity_relationships.length /
        4;

  // Semantic proximity (page embedding <-> target keyword embedding) folds
  // in as a third component only when Voyage AI embeddings are actually
  // available (VOYAGE_API_KEY set) — otherwise this degrades gracefully
  // back to the original 50/50 split rather than guessing a proximity
  // value, same "provisional when data is missing" pattern as authority.
  const proximity = semanticProximity(page.embedding ?? null, targetKeywordEmbedding ?? null);

  const rawScore =
    proximity === null
      ? entityCoverage * 0.5 + avgDepth * 100 * 0.5
      : entityCoverage * 0.4 + avgDepth * 100 * 0.3 + proximity * 100 * 0.3;

  return {
    module: "entities_semantic",
    raw_score: Math.round(rawScore),
    weight: 0,
    provisional: false,
    confidence: "medium",
    notes:
      proximity === null
        ? "50% entity coverage relative to union across compared pages, 50% average relationship depth (mention < paragraph < subsection < full_section). Semantic proximity not available (VOYAGE_API_KEY unset)."
        : "40% entity coverage, 30% average relationship depth, 30% semantic proximity of page content to the target keyword (Voyage AI embeddings).",
  };
}

export function scoreEeat(page: ExtractedPage): ModuleScore {
  const e = page.eeat;
  // YMYL categories (medical/financial/legal/safety) get held to a
  // stricter bar than general content — same checklist, harsher penalty
  // for unsubstantiated claims (spec A5/A11).
  const isYmyl = e.content_category !== "general";

  const base = boolCoverage([
    e.named_author_or_expert,
    e.author_photo,
    e.credentials.length > 0,
    e.registration_number_present,
    e.memberships.length > 0,
    Boolean(e.organization_affiliation),
    e.author_present,
    e.reviewer_present,
    e.content_reviewed_block,
    Boolean(e.last_reviewed_date),
    e.references_present,
    e.outcome_evidence_present,
    e.customer_reviews,
  ]);

  const penaltyPerClaim = isYmyl ? 8 : 5;
  const maxPenalty = isYmyl ? 40 : 30;
  const penalty = Math.min(e.unsubstantiated_claims.length * penaltyPerClaim, maxPenalty);
  const rawScore = Math.max(0, base - penalty);

  const notes = [
    isYmyl
      ? `YMYL content (${e.content_category}) — stricter E-E-A-T scrutiny applied.`
      : null,
    penalty > 0
      ? `${e.unsubstantiated_claims.length} unsubstantiated claim(s) detected, -${penalty} pts (spec A11).`
      : null,
  ]
    .filter((n): n is string => n !== null)
    .join(" ");

  return {
    module: "eeat",
    raw_score: Math.round(rawScore),
    weight: 0,
    provisional: false,
    confidence: "medium",
    notes: notes || undefined,
  };
}

export function scoreExperience(page: ExtractedPage): ModuleScore {
  const x = page.experience;
  const rawScore = boolCoverage([
    x.customer_reviews,
    x.verified_reviews,
    x.outcome_evidence,
    x.case_studies,
    x.named_practitioners_or_staff.length > 0,
    x.customer_videos,
    x.real_location_photos,
    x.aftercare_or_support_guidance,
    x.customer_stories,
  ]);

  return {
    module: "experience",
    raw_score: Math.round(rawScore),
    weight: 0,
    provisional: false,
    confidence: "medium",
  };
}

export function scoreLocal(page: ExtractedPage): ModuleScore {
  const l = page.local;
  const rawScore = boolCoverage([
    l.city_in_title,
    l.city_in_h1,
    l.city_in_intro,
    l.provider_city_association,
    l.business_city_association,
    l.neighborhood_coverage.length > 0,
    l.address_present,
    l.phone_present,
    l.map_or_directions_present,
    l.local_reviews,
    l.local_cost_info,
    l.local_faqs,
    l.local_business_schema,
    l.geo_markup,
  ]);

  return {
    module: "local",
    raw_score: Math.round(rawScore),
    weight: 0,
    provisional: false,
    confidence: "medium",
  };
}

export function scoreSchemaTechnical(page: ExtractedPage): ModuleScore {
  const schemaScore =
    (page.schema_data.types_present.length / KNOWN_SCHEMA_TYPE_COUNT) * 100;

  const technicalScore = boolCoverage([
    page.technical.indexable,
    page.technical.mobile_friendly,
    page.technical.lazy_loading,
  ]);

  const rawScore = schemaScore * 0.6 + technicalScore * 0.4;

  return {
    module: "schema_technical",
    raw_score: Math.round(Math.min(100, rawScore)),
    weight: 0,
    provisional: false,
    confidence: "high",
    notes: "60% structured-data type coverage, 40% observable technical signals (CWV not yet wired — see README).",
  };
}

export function scoreAuthority(
  page: ExtractedPage,
  allPages: ExtractedPage[]
): ModuleScore {
  if (page.authority.status !== "ok" || page.authority.referring_domains === null) {
    return {
      module: "authority",
      raw_score: 0,
      weight: 0,
      provisional: true,
      confidence: "low",
      notes: "DataForSEO data unavailable or not requested — excluded from normalized score (spec A9/Part C).",
    };
  }

  const maxReferringDomains = Math.max(
    1,
    ...allPages.map((p) => p.authority.referring_domains ?? 0)
  );
  const rawScore = ((page.authority.referring_domains ?? 0) / maxReferringDomains) * 100;

  return {
    module: "authority",
    raw_score: Math.round(rawScore),
    weight: 0,
    provisional: false,
    confidence: "low",
    notes: "Relative to the highest referring-domain count among compared pages. Quality/relevance of links not yet weighted (v2).",
  };
}

export const MODULE_SCORERS: Record<
  ScoreModule,
  (page: ExtractedPage, allPages: ExtractedPage[], targetKeywordEmbedding?: number[] | null) => ModuleScore
> = {
  content_architecture: scoreContentArchitecture,
  entities_semantic: scoreEntitiesSemantic,
  eeat: (page) => scoreEeat(page),
  experience: (page) => scoreExperience(page),
  local: (page) => scoreLocal(page),
  schema_technical: (page) => scoreSchemaTechnical(page),
  authority: scoreAuthority,
};
