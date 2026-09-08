"use client";

import { useEffect, useState } from "react";
import type { AuditReportResponse } from "@/types/audit";
import ReportView from "./report-view";

type PollResult = AuditReportResponse | { status: string; keyword?: string; error?: string };

/**
 * Fetches + polls a single audit run's status/report and renders it.
 * Shared between AuditDashboard (right after submitting a new audit) and
 * the history detail page (reopening a past one) so the polling logic
 * and report rendering only live in one place.
 */
export default function AuditView({ auditRunId }: { auditRunId: string }) {
  const [result, setResult] = useState<PollResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      const res = await fetch(`/api/audits/${auditRunId}`);
      const data: PollResult = await res.json();
      if (cancelled) return;
      setResult(data);
      if ((data.status === "success" || data.status === "failed") && intervalId) {
        clearInterval(intervalId);
      }
    }

    poll();
    intervalId = setInterval(poll, 4000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [auditRunId]);

  if (!result || result.status === "pending" || result.status === "running") {
    return (
      <p className="text-sm text-slate-500">
        {result?.status === "running" ? "Running audit…" : "Loading…"} This usually takes 30–90
        seconds for a fresh audit.
      </p>
    );
  }

  if (result.status === "failed") {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Audit failed: {"error" in result ? result.error : "Unknown error"}
      </p>
    );
  }

  return <ReportView report={result as AuditReportResponse} auditRunId={auditRunId} />;
}
