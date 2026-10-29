// Core types for the audit pipeline. Mirrors Part A6 (input), A7 (extracted
// data), B5 (entity relationships), B6 (gap classification) and Part E
// (API response shape) of the master spec.

export type Confidence = "high" | "medium" | "low";

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "local"
  | "cost"
  | "comparison"
  | "navigational";

// Google's YMYL ("Your Money or Your Life") content categories — pages in
// these categories get held to a stricter E-E-A-T bar (spec A5/A11). Any
// page that doesn't fall into one of these is "general" and gets the
// baseline trust/expertise checklist instead of a category-specific one.
export type ContentCategory =
  | "ymyl_medical"
  | "ymyl_financial"
  | "ymyl_legal"
  | "ymyl_safety"
  | "general";

// ---------------------------------------------------------------------------
// A6 — Required inputs
// ---------------------------------------------------------------------------

export interface AuditPageInput {
  url: string;
  observed_rank?: number;
  is_own_page?: boolean; // marks the page internal-link suggestions are generated for
}

// A same-site page the caller offers as a candidate internal-link target,
// e.g. { url: "https://example.com/pricing", topic: "pricing and plans" }.
// Only meaningful alongside an is_own_page: true entry in `pages`.
export interface InternalLinkCandidate {
  url: string;
  topic: string;
}

export interface AuditInput {
  target_keyword: string;
  pages: AuditPageInput[];
  location?: string;
  industry?: string;
  page_type?: string;
  country?: string;
  competitor_data_source?: "manual" | "crawler" | "api";
  internal_link_candidates?: InternalLinkCandidate[];
}

export interface SerpIntentResult {
  primary: SearchIntent;
  secondary: SearchIntent[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// A7 — Data extracted per page
// ---------------------------------------------------------------------------

export interface OnPageData {
  title: string | null;
  title_length: number | null;
  meta_description: string | null;
  meta_description_length: number | null;
  canonical: string | null;
  robots: string | null;
  http_status: number | null;
  headings: { level: 1 | 2 | 3 | 4; text: string }[];
  word_count: number | null;
  published_date: string | null;
  modified_date: string | null;
  author: string | null;
  reviewer: string | null;
  last_reviewed_date: string | null;
}

// Canonical section labels are now assigned by Claude per-page (see
// src/modules/entities), not matched against a fixed keyword list — a
// medical audit and a SaaS pricing-page audit need entirely different
// section vocabularies, and the labels themselves are just distribution
// data to scoring/gap-classification (they never branch on specific
// values), so a free-form string is the correct type here.
export type ContentSection = string;

export interface ContentArchitecture {
  sections_present: ContentSection[];
  sections_by_heading: { heading: string; section: ContentSection }[];
}

// Generalized across industries — see the extraction prompt in
// src/modules/entities for how each label is applied (e.g. "core_subject"
// is the condition/procedure on a medical page, the product/service on a
// SaaS or e-commerce page, the claim type on a legal/insurance page).
export type EntityType =
  | "core_subject"
  | "component_or_aspect"
  | "method_or_technique"
  | "tool_or_resource"
  | "evaluation_or_test"
  | "risk_or_limitation"
  | "outcome_or_benefit"
  | "person_or_expert"
  | "organization"
  | "location"
  | "cost_or_pricing"
  | "coverage_or_regulatory"
  | "user_evidence";

export interface Entity {
  name: string;
  type: EntityType;
  mentions: number;
}

// B5 — Entity relationships stored as EAV triples
export type MentionDepth = "mention" | "paragraph" | "subsection" | "full_section";

export interface EntityRelationship {
  entity: string;
  attribute: string;
  value: string;
  depth: MentionDepth;
}

export interface SchemaData {
  types_present: string[]; // e.g. Article, FAQPage, Product, MedicalWebPage, LocalBusiness
  properties: Record<string, unknown>;
  missing_recommended: string[];
}

// Ready-to-paste JSON-LD for a schema type judged genuinely relevant to this
// specific page and missing from it (src/modules/schema-recommendations) —
// distinct from the raw missing_recommended coverage list above, which is
// just "not present" with no relevance judgment or generated markup.
export interface SchemaRecommendation {
  schema_type: string;
  json_ld: Record<string, unknown>;
  rationale: string;
}

export interface InternalLinkSuggestion {
  anchor_text: string;
  link_to_url: string;
  placement_context: string;
}

export interface SocialMetadata {
  open_graph: Record<string, string>;
  twitter: Record<string, string>;
}

export interface TechnicalData {
  indexable: boolean | null;
  robots_directives: string[];
  sitemap_listed: boolean | null;
  hreflang: string[];
  mobile_friendly: boolean | null;
  js_dependent_content: boolean | null;
  core_web_vitals: {
    lcp_ms: number | null;
    inp_ms: number | null;
    cls: number | null;
    ttfb_ms: number | null;
  } | null;
  images_optimized: boolean | null;
  lazy_loading: boolean | null;
  dom_size: number | null;
  crawl_depth: number | null;
  internal_links_count: number | null;
  broken_links_count: number | null;
  redirect_chain_length: number | null;
  is_orphan: boolean | null;
}

export interface AuthorityData {
  status: "ok" | "unavailable" | "not_requested";
  referring_domains: number | null;
  backlinks_total: number | null;
  topical_backlink_relevance: number | null; // 0-1, heuristic
  top_anchor_texts: { anchor: string; count: number }[];
  domain_authority_proxy: number | null;
  branded_mentions: number | null;
}

export type SentimentTone = "clinical" | "promotional" | "mixed" | "neutral";

export interface SentimentData {
  tone: SentimentTone;
  promotional_phrases_detected: string[];
  note: string; // always: diagnostic only, never a ranking claim
}

export interface EeatData {
  content_category: ContentCategory; // self-reported by the module (spec A5/A11)
  named_author_or_expert: boolean;
  author_photo: boolean;
  credentials: string[]; // e.g. MBBS/MS (medical), CFA/CPA (financial), JD/Esq (legal), or role titles
  specialty: string | null;
  years_experience: number | null;
  registration_number_present: boolean; // license/registration/certification number
  memberships: string[];
  organization_affiliation: string | null;
  author_present: boolean;
  reviewer_present: boolean;
  content_reviewed_block: boolean; // "medically reviewed by" / "legally reviewed by" / "fact-checked by" etc.
  last_reviewed_date: string | null;
  references_present: boolean;
  outcome_evidence_present: boolean; // before/after cases, case studies, verifiable results
  customer_reviews: boolean;
  unsubstantiated_claims: string[]; // flagged per A11
}

export interface ExperienceData {
  customer_reviews: boolean;
  verified_reviews: boolean;
  outcome_evidence: boolean; // before/after photos, demos, portfolio, screenshots of results
  case_studies: boolean;
  named_practitioners_or_staff: string[];
  customer_videos: boolean;
  real_location_photos: boolean;
  aftercare_or_support_guidance: boolean; // post-purchase/post-treatment/post-service guidance
  customer_stories: boolean;
}

export interface LocalSeoData {
  city_in_title: boolean;
  city_in_h1: boolean;
  city_in_intro: boolean;
  provider_city_association: boolean; // named person + city, e.g. "Dr. X in Koramangala" or "Attorney Y in Austin"
  business_city_association: boolean;
  neighborhood_coverage: string[];
  address_present: boolean;
  phone_present: boolean;
  map_or_directions_present: boolean;
  local_reviews: boolean;
  local_cost_info: boolean;
  local_faqs: boolean;
  local_business_schema: boolean;
  geo_markup: boolean;
}

// ---------------------------------------------------------------------------
// Scoring (A9)
// ---------------------------------------------------------------------------

export type ScoreModule =
  | "content_architecture"
  | "entities_semantic"
  | "eeat"
  | "experience"
  | "local"
  | "schema_technical"
  | "authority";

export interface ModuleScore {
  module: ScoreModule;
  raw_score: number; // 0-100
  weight: number; // 0-1
  provisional: boolean; // true if underlying data was missing/unavailable
  confidence: Confidence;
  notes?: string;
}

export interface PageScoreSummary {
  url: string;
  module_scores: ModuleScore[];
  current_score: number; // normalized 0-100
  projected_score?: number; // 0-100, after applying recommendations
  coverage: number; // % of modules with non-provisional data, 0-100
}

// ---------------------------------------------------------------------------
// B6 — Gap classification
// ---------------------------------------------------------------------------

export type GapType = "core_gap" | "differentiator_gap" | "commodity_gap" | "opportunity_gap";

export interface ContentGap {
  topic: string;
  gap_type: GapType;
  present_on: string[]; // page urls where this topic is present
  missing_on: string[]; // page urls where this topic is missing
  recommendation: string;
}

export interface RankingHypothesisItem {
  statement: string;
  confidence: Confidence;
  evidence_type: "observed" | "inferred" | "requires_external_data";
}

export interface Recommendation {
  priority: "high" | "medium" | "low";
  page_url: string;
  category: ScoreModule | "technical" | "content";
  action: string;
  rationale: string;
}

// A structural writing brief for a core_gap/differentiator_gap worth
// actually writing content for — what to add and roughly how, never drafted
// copy or invented facts (src/modules/content-brief).
export interface ContentBrief {
  topic: string; // matches a ContentGap.topic
  gap_type: GapType;
  target_page_urls: string[]; // pages missing this topic the brief is for
  sections_to_add: string[];
  key_entities_to_include: string[];
  suggested_depth: MentionDepth;
  brief: string;
}

// ---------------------------------------------------------------------------
// Fully assembled per-page + comparison records (persisted in Supabase)
// ---------------------------------------------------------------------------

export interface SerpCheckResult {
  observed_rank: number | null; // 1-10, or null if not found in top 10
  checked_at: string;
  note: string;
}

export interface ExtractedPage {
  url: string;
  observed_rank: number | null;
  serp_check: SerpCheckResult | null;
  embedding: number[] | null;
  on_page: OnPageData;
  content: ContentArchitecture;
  entities: Entity[];
  entity_relationships: EntityRelationship[];
  schema_data: SchemaData;
  social_metadata: SocialMetadata;
  technical: TechnicalData;
  authority: AuthorityData;
  sentiment: SentimentData;
  eeat: EeatData;
  experience: ExperienceData;
  local: LocalSeoData;
  schema_recommendations: SchemaRecommendation[];
  // null = not requested (no internal_link_candidates supplied for this
  // page); [] = requested but nothing genuinely relevant was found.
  internal_link_suggestions: InternalLinkSuggestion[] | null;
  scores: PageScoreSummary | null;
}

export interface AuditComparison {
  page_advantages: Record<string, string[]>; // url -> advantages
  content_gaps: ContentGap[];
  semantic_gaps: ContentGap[];
  technical_gaps: ContentGap[];
  authority_gaps: ContentGap[];
  content_briefs: ContentBrief[];
  ranking_hypothesis: RankingHypothesisItem[];
  recommendations: Recommendation[];
  current_scores: Record<string, number>;
  projected_scores: Record<string, number>;
  confidence: Confidence;
  missing_data: string[];
}

// ---------------------------------------------------------------------------
// Part E — API response shape
// ---------------------------------------------------------------------------

export interface AuditRunStatus {
  id: string;
  status: "pending" | "running" | "complete" | "failed";
  target_keyword: string;
  created_at: string;
  completed_at: string | null;
  error?: string | null;
}

export interface AuditReportResponse {
  status: "success" | "pending" | "failed";
  keyword: string;
  audit?: {
    search_intent: { primary: SearchIntent; secondary: SearchIntent[] } | null;
    page_comparison: {
      page_advantages: Record<string, string[]>;
      content_gaps: ContentGap[];
    };
    entity_semantic_analysis: {
      url: string;
      entities: Entity[];
      entity_relationships: EntityRelationship[];
      semantic_gaps: ContentGap[];
    }[];
    eeat_analysis: { url: string; eeat: EeatData; experience: ExperienceData }[];
    local_analysis: { url: string; local: LocalSeoData }[];
    schema_analysis: { url: string; schema: SchemaData }[];
    technical_analysis: { url: string; technical: TechnicalData }[];
    authority_analysis: { url: string; authority: AuthorityData }[];
    schema_recommendations: { url: string; recommendations: SchemaRecommendation[] }[];
    internal_link_suggestions: { url: string; suggestions: InternalLinkSuggestion[] | null }[];
  };
  scores?: Record<
    string,
    {
      current: number;
      projected?: number;
      coverage: number;
      observed_rank?: number | null;
      serp_check_note?: string;
    }
  >;
  ranking_hypothesis?: RankingHypothesisItem[];
  recommendations?: Recommendation[];
  content_briefs?: ContentBrief[];
  missing_data?: string[];
  confidence?: Confidence | "medium-high";
}
