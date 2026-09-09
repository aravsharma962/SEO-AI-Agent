import { callClaudeForJson } from "@/lib/anthropic/client";
import type { EeatData } from "@/types/audit";

const SYSTEM_PROMPT = `You evaluate E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals on a
page for a comparative SEO audit that runs across ANY industry, not just one vertical.

Step 1 — classify content_category. Pick the ONE that best fits what the page is about:
- ymyl_medical: health, medical conditions/treatments, drugs, mental health, fitness-as-medical-advice
- ymyl_financial: investing, loans, insurance, taxes, retirement, debt, financial products
- ymyl_legal: legal rights, lawsuits, immigration, criminal defense, contracts, regulatory compliance
- ymyl_safety: safety-critical topics (e.g. child safety, workplace safety, disaster preparedness)
- general: everything else (software, e-commerce products, home services, education, entertainment,
  general how-to content, etc.) — Google's own guidance holds YMYL pages to a stricter bar than
  general content, so do NOT classify a page as YMYL just because it involves money or advice in
  passing (e.g. a SaaS pricing page is "general", a page about choosing a life-insurance policy is
  "ymyl_financial").

Step 2 — apply the checklist below. For a YMYL category (any value other than "general"), be
STRICT: only mark a signal true when it is explicitly, verifiably present, and expect real pages
in that category to need named credentialed authors/reviewers, registration or license numbers,
and recent review dates to score well. For "general" content, apply the SAME checklist but judge
it more leniently — a well-written guide with a named author and clear sourcing is enough; do not
penalize it for lacking medical-style credentials or license numbers that would not exist for its
industry.

Rules (must follow, per spec A5/A11):
- Score ONLY what is verifiable/explicit in the text. Do not reward unsubstantiated superlative
  phrases ("best in the world", "guaranteed results", "#1 rated") without supporting evidence
  (credentials, citations, named reviewer, etc.) — instead list them in unsubstantiated_claims.
  Weigh this especially heavily for YMYL categories.
- Do not invent credentials, registration numbers, years of experience, or affiliations that are
  not explicitly stated.
- last_reviewed_date and years_experience must be null if not explicitly present.
- credentials/registration_number_present/memberships should reflect whatever is appropriate to
  the detected category (e.g. medical license for ymyl_medical, CFA/CPA for ymyl_financial, bar
  admission for ymyl_legal, relevant certifications/experience for general).

Respond with ONLY a JSON object matching this shape:
{"content_category": "ymyl_medical|ymyl_financial|ymyl_legal|ymyl_safety|general",
 "named_author_or_expert": bool, "author_photo": bool, "credentials": ["..."], "specialty": string|null,
 "years_experience": number|null, "registration_number_present": bool, "memberships": ["..."],
 "organization_affiliation": string|null, "author_present": bool, "reviewer_present": bool,
 "content_reviewed_block": bool, "last_reviewed_date": string|null, "references_present": bool,
 "outcome_evidence_present": bool, "customer_reviews": bool, "unsubstantiated_claims": ["..."]}
No text outside the JSON object.`;

/**
 * A8 Step 5: E-E-A-T Analysis. Layer: Claude (checklist-guided). Runs a
 * single call that both classifies the page's YMYL content_category and
 * scores the checklist against it, rather than a separate classification
 * call, to keep per-audit Claude cost flat (spec Part C).
 */
export async function analyzeEeat(pageText: string): Promise<EeatData> {
  const truncated = pageText.slice(0, 15000);

  const result = await callClaudeForJson<EeatData>({
    system: SYSTEM_PROMPT,
    user: truncated,
    maxTokens: 2048,
  });

  return {
    ...result,
    content_category: result.content_category ?? "general",
  };
}
