import type { ContentArchitecture, ContentSection } from "@/types/audit";

/**
 * Layer: Code (heading-pattern keyword match) + Claude for ambiguous
 * headings — see Part B2. This file implements the deterministic pass;
 * headings that don't match any pattern are left "unclassified" for the
 * Claude-assisted pass in classifyAmbiguousHeadings() below.
 */
const SECTION_KEYWORDS: Record<ContentSection, string[]> = {
  intro: ["introduction", "overview", "what is"],
  condition_overview: ["what is", "understanding", "about"],
  types_or_grades: ["types", "grades", "classification", "stages"],
  diagnosis: ["diagnosis", "diagnostic", "how is it diagnosed"],
  candidacy: ["candidate", "who is eligible", "am i a candidate"],
  treatment_options: ["treatment options", "treatments available"],
  technique: ["technique", "method", "approach"],
  procedure: ["procedure", "how it's done", "how it is performed", "surgery steps"],
  prep: ["preparation", "before surgery", "pre-operative", "pre-op"],
  anaesthesia: ["anaesthesia", "anesthesia"],
  duration: ["duration", "how long does"],
  hospital_stay: ["hospital stay", "admission"],
  recovery: ["recovery", "post-operative", "post-op", "aftercare", "healing"],
  follow_up: ["follow-up", "follow up", "post-treatment care"],
  risks: ["risks", "side effects"],
  complications: ["complications"],
  results: ["results", "outcomes", "before and after"],
  recurrence: ["recurrence", "relapse"],
  scars: ["scar", "scarring"],
  cost: ["cost", "price", "how much does"],
  insurance: ["insurance", "covered by"],
  doctor: ["doctor", "surgeon", "specialist", "about dr"],
  clinic_or_hospital: ["clinic", "hospital", "our facility", "about us"],
  before_after: ["before and after", "before/after", "gallery"],
  reviews: ["reviews", "testimonials", "patient stories"],
  faqs: ["faq", "frequently asked questions"],
  references: ["references", "sources", "citations", "bibliography"],
  cta: ["book", "consult", "appointment", "contact us", "schedule"],
};

function matchSection(headingText: string): ContentSection | "unclassified" {
  const lower = headingText.toLowerCase();
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS) as [
    ContentSection,
    string[]
  ][]) {
    if (keywords.some((kw) => lower.includes(kw))) return section;
  }
  return "unclassified";
}

export function mapContentArchitecture(
  headings: { level: number; text: string }[]
): ContentArchitecture {
  const sectionsByHeading = headings.map((h) => ({
    heading: h.text,
    section: matchSection(h.text),
  }));

  const sectionsPresent = Array.from(
    new Set(
      sectionsByHeading
        .map((s) => s.section)
        .filter((s): s is ContentSection => s !== "unclassified")
    )
  );

  return { sections_present: sectionsPresent, sections_by_heading: sectionsByHeading };
}
