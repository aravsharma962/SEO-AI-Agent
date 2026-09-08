"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuditReportResponse } from "@/types/audit";
import ReportView from "./report-view";

type PollResult = AuditReportResponse | { status: string; keyword?: string; error?: string };

export default function AuditDashboard({
  clientName,
  userEmail,
}: {
  clientName: string;
  userEmail: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [auditRunId, setAuditRunId] = useState<string | null>(null);
  const [result, setResult] = useState<PollResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setResult(null);

    const response = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_keyword: keyword,
        pages: [{ url: urlA, observed_rank: 1 }, { url: urlB, observed_rank: 2 }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setSubmitError(data.message ?? "Failed to start audit");
      return;
    }

    setAuditRunId(data.audit_run_id);

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const poll = await fetch(`/api/audits/${data.audit_run_id}`);
      const pollData: PollResult = await poll.json();
      setResult(pollData);
      if (pollData.status === "success" || pollData.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 4000);
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isSuccess = result?.status === "success";

  return (
    <main className={`mx-auto px-6 py-12 ${isSuccess ? "max-w-4xl" : "max-w-3xl"}`}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">SEO AI Agent</h1>
          <p className="mt-1 text-sm text-slate-600">
            {clientName} — signed in as {userEmail}
          </p>
        </div>
        <button onClick={handleSignOut} className="text-sm text-slate-600 underline">
          Sign out
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium">Target keyword</label>
          <input
            required
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="gynecomastia surgery in delhi"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Your page URL</label>
          <input
            required
            type="url"
            value={urlA}
            onChange={(e) => setUrlA(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Competitor page URL</label>
          <input
            required
            type="url"
            value={urlB}
            onChange={(e) => setUrlB(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Run audit
        </button>
      </form>

      {submitError && <p className="mt-4 text-sm text-red-600">{submitError}</p>}

      {auditRunId && (
        <div className="mt-10">
          {!result || result.status === "pending" || result.status === "running" ? (
            <p className="text-sm text-slate-500">
              {result?.status === "running" ? "Running audit…" : "Waiting for status…"} This usually takes 30–90
              seconds.
            </p>
          ) : result.status === "failed" ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Audit failed: {"error" in result ? result.error : "Unknown error"}
            </p>
          ) : (
            <ReportView report={result as AuditReportResponse} auditRunId={auditRunId} />
          )}
        </div>
      )}
    </main>
  );
}
