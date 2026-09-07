"use client";

import { useState, useRef, useEffect } from "react";
import type { AuditReportResponse } from "@/types/audit";

type PollResult = AuditReportResponse | { status: string; keyword?: string; error?: string };

export default function HomePage() {
  const [clientId, setClientId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [auditRunId, setAuditRunId] = useState<string | null>(null);
  const [result, setResult] = useState<PollResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        client_id: clientId,
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">SEO AI Agent</h1>
      <p className="mt-1 text-sm text-slate-600">
        Comparative ranking diagnostic — compare a client page against a higher-ranking
        competitor page for a target keyword.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium">Client ID (Supabase clients.id)</label>
          <input
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
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
        <div className="mt-8">
          <p className="text-sm text-slate-600">Audit run: {auditRunId}</p>
          <pre className="mt-2 max-h-[600px] overflow-auto rounded bg-slate-900 p-4 text-xs text-slate-100">
            {result ? JSON.stringify(result, null, 2) : "Waiting for status..."}
          </pre>
        </div>
      )}
    </main>
  );
}
