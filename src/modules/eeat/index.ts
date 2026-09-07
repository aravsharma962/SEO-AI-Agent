import { callClaudeForJson } from "@/lib/anthropic/client";
import type { EeatData } from "@/types/audit";

const SYSTEM_PROMPT = `You evaluate Medical E-E-A-T signals on a page for a YMYL (medical) SEO audit.

Rules (must follow, per spec A5/A11):
- Score ONLY what is verifiable/explicit in the text. Do not reward unsubstantiated
  superlative phrases ("best surgeon", "world-class", "safest surgery") without
  supporting evidence (credentials, citations, named reviewer, etc.) — instead list
  them in unsubstantiated_claims.
- Do not invent credentials, registration numbers, years of experience, or affiliations
  that are not explicitly stated.
- last_reviewed_date and years_experience must be null if not explicitly present.

Respond with ONLY a JSON object matching this shape:
{"named_doctor": bool, "doctor_photo": bool, "credentials": ["MBBS", ...], "specialty": string|null,
 "years_experience": number|null, "registration_number_present": bool, "memberships": ["..."],
 "hospital_affiliation": string|null, "author_present": bool, "reviewer_present": bool,
 "medically_reviewed_block": bool, "last_reviewed_date": string|null, "references_present": bool,
 "before_after_cases": bool, "patient_reviews": bool, "unsubstantiated_claims": ["..."]}
No text outside the JSON object.`;

/**
 * A8 Step 5: Medical E-E-A-T Analysis. Layer: Claude (checklist-guided).
 */
export async function analyzeEeat(pageText: string): Promise<EeatData> {
  const truncated = pageText.slice(0, 15000);

  return callClaudeForJson<EeatData>({
    system: SYSTEM_PROMPT,
    user: truncated,
    maxTokens: 1024,
  });
}
