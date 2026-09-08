import { callClaudeForJson } from "@/lib/anthropic/client";
import type { ExperienceData } from "@/types/audit";

const SYSTEM_PROMPT = `You evaluate "Experience" signals (Google's E-E-A-T "Experience" pillar) on a page:
real patient reviews, before/after photos, case studies, named treating doctors, patient
videos, real location photos, recovery guidance, patient stories. Only mark true if
explicitly evidenced in the content — do not infer from generic marketing copy.

Respond with ONLY a JSON object:
{"patient_reviews": bool, "verified_reviews": bool, "before_after_photos": bool,
 "case_studies": bool, "named_treating_doctors": ["..."], "patient_videos": bool,
 "real_location_photos": bool, "recovery_guidance": bool, "patient_stories": bool}
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
