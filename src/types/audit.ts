// Core types for the audit pipeline. Mirrors Part A6 (input), A7 (extracted
// data), B5 (entity relationships), B6 (gap classification) and Part E
// (API response shape) of the master spec.

export type Confidence = "high" | "medium" | "low";

export type SearchIntent =
  | "informational"
  | "commercial"
  | "transactional"
  | "local"
  | "medical"
  | "procedure"
  | "cost"
  | "doctor"
  | "comparison"
  | "navigational";

// ---------------------------------------------------------------------------
// A6 — Required inputs
// ---------------------------------------------------------------------------

export interface AuditPageInput {
  url: string;
  observed_rank?: number;
}

export interface AuditInput {
  target_keyword: string;
  pages: AuditPageInput[];
  location?: string;
  industry?: string;
  page_type?: string;
  country?: string;
  competitor_data_source?: "manual" | "crawler" | "api";
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

export type ContentSection =
  | "intro"
  | "condition_overview"
  | "types_or_grades"
  | "diagnosis"
  | "candidacy"
  | "treatment_options"
  | "technique"
  | "procedure"
  | "prep"
  | "anaesthesia"
  | "duration"
  | "hospital_stay"
  | "recovery"
  | "follow_up"
  | "risks"
  | "complications"
  | "results"
  | "recurrence"
  | "scars"
  | "cost"
  | "insurance"
  | "doctor"
  | "clinic_or_hospital"
  | "before_after"
  | "reviews"
  | "faqs"
  | "references"
  | "cta";

export interface ContentArchitecture {
  sections_present: ContentSection[];
  sections_by_heading: { heading: string; section: ContentSection | "unclassified" }[];
}

export type EntityType =
  | "condition_or_procedure"
  | "anatomy"
  | "tissue"
  | "technique"
  | "equipment"
  | "diagnostic_test"
  | "medication"
  | "risk"
  | "recovery_concept"
  | "doctor"
  | "hospital_or_clinic"
  | "location"
  | "cost"
  | "insurance"
  | "patient_evidence";

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
  types_present: string[]; // e.g. MedicalWebPage, FAQPage, Physician
  properties: Record<string, unknown>;
  missing_recommended: string[];
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
  named_doctor: boolean;
  doctor_photo: boolean;
  credentials: string[]; // e.g. MBBS, MS, MCh, DNB
  specialty: string | null;
  years_experience: number | null;
  registration_number_present: boolean;
  memberships: string[];
  hospital_affiliation: string | null;
  author_present: boolean;
  reviewer_present: boolean;
  medically_reviewed_block: boolean;
  last_reviewed_date: string | null;
  references_present: boolean;
  before_after_cases: boolean;
  patient_reviews: boolean;
  unsubstantiated_claims: string[]; // flagged per A11
}

export interface ExperienceData {
  patient_reviews: boolean;
  verified_reviews: boolean;
  before_after_photos: boolean;
  case_studies: boolean;
  named_treating_doctors: string[];
  patient_videos: boolean;
  real_location_photos: boolean;
  recovery_guidance: boolean;
  patient_stories: boolean;
}

export interface LocalSeoData {
  city_in_title: boolean;
  city_in_h1: boolean;
  city_in_intro: boolean;
  doctor_city_association: boolean;
  clinic_city_association: boolean;
  neighborhood_coverage: string[];
  address_present: boolean;
  phone_present: boolean;
  map_or_directions_present: boolean;
  local_reviews: boolean;
  local_cost_info: boolean;
  local_faqs: boolean;
  local_business_or_hospital_schema: boolean;
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
  scores: PageScoreSummary | null;
}

export interface AuditComparison {
  page_advantages: Record<string, string[]>; // url -> advantages
  content_gaps: ContentGap[];
  semantic_gaps: ContentGap[];
  technical_gaps: ContentGap[];
  authority_gaps: ContentGap[];
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
  missing_data?: string[];
  confidence?: Confidence | "medium-high";
}
