import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { computeCalibrationReport } from "@/modules/calibration";

/**
 * GET /api/calibration — scoring-weight calibration report for the
 * caller's active workspace. See src/modules/calibration for what this
 * actually measures and why it's gated on sample size rather than always
 * producing a number.
 */
export async function GET() {
  const supabase = createSupabaseServerClient();
  const workspace = await getActiveWorkspace(supabase);

  if (!workspace) {
    return NextResponse.json({ status: "error", message: "Not authenticated" }, { status: 401 });
  }

  const report = await computeCalibrationReport(supabase, workspace.clientId);
  return NextResponse.json(report);
}
