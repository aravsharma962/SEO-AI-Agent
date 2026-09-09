"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AuditView from "./audit-view";
import WorkspaceSwitcher from "./workspace-switcher";
import type { WorkspaceSummary } from "@/lib/workspace";

export default function AuditDashboard({
  userEmail,
  workspaces,
  activeClientId,
}: {
  userEmail: string;
  workspaces: WorkspaceSummary[];
  activeClientId: string;
}) {
  const [keyword, setKeyword] = useState("");
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [internalLinkCandidatesText, setInternalLinkCandidatesText] = useState("");
  const [auditRunId, setAuditRunId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setAuditRunId(null);

    // "url | short topic description", one per line — optional, only used
    // to generate internal-link suggestions for your own page (urlA).
    const internalLinkCandidates = internalLinkCandidatesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [url, ...rest] = line.split("|");
        return { url: (url ?? "").trim(), topic: rest.join("|").trim() };
      })
      .filter((c) => c.url && c.topic);

    const response = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_keyword: keyword,
        pages: [{ url: urlA, is_own_page: true }, { url: urlB }],
        ...(internalLinkCandidates.length > 0 ? { internal_link_candidates: internalLinkCandidates } : {}),
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">SEO AI Agent</h1>
          <p className="mt-1 text-sm text-slate-600">Signed in as {userEmail}</p>
          <div className="mt-2">
            <WorkspaceSwitcher workspaces={workspaces} activeClientId={activeClientId} />
          </div>
        </div>
        <div className="flex flex-none items-center gap-4">
          <Link href="/history" className="text-sm text-slate-600 underline">
            Audit history
          </Link>
          <Link href="/calibration" className="text-sm text-slate-600 underline">
            Calibration
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
            placeholder="e.g. term life insurance for seniors, best crm for startups"
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
        <div>
          <label className="block text-sm font-medium">
            Internal link candidates <span className="text-slate-400">(optional)</span>
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Other pages on your own site the audit can suggest linking to from your page above.
            One per line: <code className="rounded bg-slate-100 px-1">url | short topic</code>
          </p>
          <textarea
            value={internalLinkCandidatesText}
            onChange={(e) => setInternalLinkCandidatesText(e.target.value)}
            rows={3}
            placeholder={"https://example.com/pricing | pricing and plans\nhttps://example.com/faq | frequently asked questions"}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
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
