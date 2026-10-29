import { callClaudeForJson } from "@/lib/anthropic/client";
import type { ExperienceData } from "@/types/audit";

const SYSTEM_PROMPT = `You evaluate "Experience" signals (Google's E-E-A-T "Experience" pillar) on a page, across
ANY industry: real customer reviews, outcome evidence (before/after photos, demos, portfolio
pieces, results screenshots — whatever form "proof it works" takes for this page's industry),
case studies, named practitioners/staff who actually did the work, customer videos, real location
photos, aftercare/post-purchase/post-service guidance, and customer stories. Only mark true if
explicitly evidenced in the content — do not infer from generic marketing copy.

Respond with ONLY a JSON object:
{"customer_reviews": bool, "verified_reviews": bool, "outcome_evidence": bool,
 "case_studies": bool, "named_practitioners_or_staff": ["..."], "customer_videos": bool,
 "real_location_photos": bool, "aftercare_or_support_guidance": bool, "customer_stories": bool}
No text outside the JSON object.`;

/**
 * A8 Step 6: Experience Signal Analysis. Layer: Claude (checklist-guided).
 */
export async function analyzeExperience(pageText: string): Promise<ExperienceData> {
  const truncated = pageText.slice(0, 15000);

  return callClaudeForJson<ExperienceData>({
    system: SYSTEM_PROMPT,
    user: truncated,
    maxTokens: 1024,
  });
}
