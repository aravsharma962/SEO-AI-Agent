"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AuditView from "./audit-view";

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setAuditRunId(null);

    const response = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_keyword: keyword,
        pages: [{ url: urlA }, { url: urlB }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setSubmitError(data.message ?? "Failed to start audit");
      return;
    }

    setAuditRunId(data.audit_run_id);
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className={`mx-auto px-6 py-12 ${auditRunId ? "max-w-4xl" : "max-w-3xl"}`}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">SEO AI Agent</h1>
          <p className="mt-1 text-sm text-slate-600">
            {clientName} — signed in as {userEmail}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/history" className="text-sm text-slate-600 underline">
            Audit history
          </Link>
          <button onClick={handleSignOut} className="text-sm text-slate-600 underline">
            Sign out
          </button>
        </div>
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
          <AuditView auditRunId={auditRunId} />
        </div>
      )}
    </main>
  );
}
