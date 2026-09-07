import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runAuditPipeline } from "@/modules/pipeline";
import type { AuditInput } from "@/types/audit";

// A6 — Required inputs, validated at the API boundary.
const AuditPageInputSchema = z.object({
  url: z.string().url(),
  observed_rank: z.number().int().positive().optional(),
});

const AuditInputSchema = z.object({
  client_id: z.string().uuid(),
  target_keyword: z.string().min(1),
  pages: z.array(AuditPageInputSchema).min(2), // A13: keyword + >=2 URLs
  location: z.string().optional(),
  industry: z.string().optional(),
  page_type: z.string().optional(),
  country: z.string().optional(),
  competitor_data_source: z.enum(["manual", "crawler", "api"]).optional(),
});

/**
 * POST /api/audits — triggers a new audit (Part B1: "API routes (trigger
 * audit, poll status, fetch report)"). Creates the audit_runs row under
 * RLS (so it's scoped to a client the caller belongs to — see migration
 * policies), then kicks off the pipeline in the background and returns
 * immediately with the run id for polling via GET /api/audits/[id].
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = AuditInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { client_id, ...input } = parsed.data;
  const supabase = createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();

  const { data: auditRun, error } = await supabase
    .from("audit_runs")
    .insert({
      client_id,
      target_keyword: input.target_keyword,
      location: input.location ?? null,
      industry: input.industry ?? null,
      page_type: input.page_type ?? null,
      created_by: authData?.user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !auditRun) {
    return NextResponse.json(
      { status: "error", message: error?.message ?? "Could not create audit run" },
      { status: 403 } // most likely cause under RLS: caller isn't a member of client_id
    );
  }

  const auditInput: AuditInput = { ...input, pages: input.pages };

  // Keeps the serverless function alive to finish the pipeline after the
  // response is sent (Vercel Fluid Compute background work — see B3). If
  // audits grow past what this comfortably covers within maxDuration
  // below, move runAuditPipeline onto the Hostinger VPS worker instead.
  waitUntil(runAuditPipeline(auditRun.id, auditInput));

  return NextResponse.json({ status: "pending", audit_run_id: auditRun.id }, { status: 202 });
}

// Allows the background pipeline (waitUntil above) up to 5 minutes on
// Vercel Pro/Fluid Compute. Bump via Vercel project settings if needed.
export const maxDuration = 300;
