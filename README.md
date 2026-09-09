# SEO AI Agent

A **Comparative Ranking Diagnostic and Optimization System**: given a target keyword and
2+ competing pages, it explains why the higher-ranked page likely outperforms the others,
identifies actionable content/entity/E-E-A-T/technical gaps, and calculates a current vs.
projected optimization score — never a rank guarantee.

Full product spec: see the master spec document supplied at project kickoff (Parts A–F).
This README covers what's actually implemented (Phase 1 "Foundation" + a working thin
vertical slice per the spec's Part D2) and how to run it.

## Stack

- **Next.js 14 (App Router, TypeScript)** — deployed on Vercel
- **Supabase** (Postgres + pgvector) — multi-tenant storage, RLS
- **Anthropic Claude API** — reasoning-heavy steps only (see "Module → layer mapping")
- **DataForSEO** — backlink/authority data (optional; audits work without it)
- **Voyage AI** — embeddings for semantic proximity (optional)

## Architecture

```
Next.js (Vercel)
  POST /api/audits        -> validates input, creates audit_runs row, kicks off pipeline
  GET  /api/audits/[id]   -> polls status, returns assembled report once complete
        |
        v
Supabase Postgres (RLS, client_id-scoped)
  audit_runs, audit_pages, audit_comparisons, audit_usage
        |
        v
Pipeline (src/modules/pipeline.ts) — runs via @vercel/functions waitUntil()
  SERP Intent -> Crawl/Extract -> On-Page -> Entities -> E-E-A-T -> Schema
  -> Technical -> DataForSEO Authority -> Scoring -> Claude reasoning
  (ranking hypothesis + recommendations) -> Report
        |
        v
Claude API — called only where judgment is required (intent classification,
entity/relationship extraction, E-E-A-T/experience/local checklist scoring,
ranking hypothesis + recommendation narrative). Everything else (HTML
parsing, weighted scoring math, gap classification, JSON assembly) is
deterministic TypeScript.
```

### Module → layer mapping

| Module | Layer | File |
|---|---|---|
| SERP intent | Claude | `src/modules/serp-intent` |
| Live SERP rank verification | Claude + `web_search` tool | `src/modules/serp-check` |
| Page crawl / extraction | Code | `src/modules/extraction` |
| Content architecture mapping | Code | `src/modules/content-architecture` |
| Entity extraction + relationships | Claude | `src/modules/entities` |
| Semantic proximity | Code (pgvector + Voyage embeddings) | `src/modules/semantic` |
| Sentiment | Claude (diagnostic only) | `src/modules/sentiment` |
| E-E-A-T | Claude (checklist-guided) | `src/modules/eeat` |
| Experience | Claude (checklist-guided) | `src/modules/experience` |
| Local SEO | Claude (checklist-guided) | `src/modules/local-seo` |
| Schema / social / technical | Code | `src/modules/extraction` |
| Authority / backlinks | Code (DataForSEO) | `src/lib/dataforseo` |
| Scoring engine | Code (deterministic) | `src/modules/scoring` |
| Gap classification | Code (deterministic) | `src/modules/comparison/gap-classification.ts` |
| Ranking hypothesis + recommendations | Claude (guardrail-constrained) | `src/modules/comparison/ranking-hypothesis.ts` |
| Report assembly | Code | `src/modules/report` |
| Orchestration | Code | `src/modules/pipeline.ts` |

### Live rank verification

Rather than trust whatever order URLs are submitted in, `src/modules/serp-check` uses
Claude with the server-side `web_search` tool to actually search for the target keyword
and check whether each URL appears in the top 10 organic results before the audit runs.
`observed_rank` on `ExtractedPage` is the live-verified value (falling back to a
caller-supplied hint only if the search comes back inconclusive) — never a guess based on
submission order. Adds ~2 extra Claude calls per audit (one per page); see the note in
`src/modules/serp-check/index.ts` on why this never throws.

### Historical rank tracking

Every completed audit seeds `rank_history` with the live-verified rank for each page
(`src/modules/pipeline.ts`). A Vercel Cron job (`vercel.json` → `/api/cron/rank-check`,
daily) re-checks any tracked (client, keyword, url) whose last check is more than 6 days
old, up to 20 per run to bound cost — this is the "automated SERP tracking" /
"ranking-change attribution" groundwork from spec Part F. Set `CRON_SECRET` in Vercel's
env vars so the cron endpoint only accepts Vercel's own signed requests. History shows up
on the report itself once a page has 2+ data points (`src/app/rank-history.tsx`).

### Competitor / page change monitoring

A second cron job (`vercel.json` → `/api/cron/competitor-watch`, weekly) re-fetches every
tracked page, hashes the content, and — only when the hash actually changed — asks Claude
to judge whether the diff is SEO-relevant (`src/modules/competitor-watch`). Most real
page diffs are noise (ads, timestamps, unrelated widget content); the Claude call is the
one genuinely agentic piece here — it decides what's signal, it isn't told. Flagged
changes show up as a "Page Activity" panel on the report once any exist
(`src/app/page-changes-panel.tsx`). Since this watches the same tracked set as rank
tracking, it also catches unexpected changes to your *own* site, not just competitors'.

### Guardrails (spec A4/A10/A11)

Enforced primarily via the system prompts in `src/modules/comparison/ranking-hypothesis.ts`,
`src/modules/eeat`, and `src/modules/sentiment`: never claim single-factor ranking
causality, never guarantee outcomes, hedge with "likely advantage" / "plausible
contributor" language, flag unsubstantiated claims instead of scoring them, and mark data
as `missing_data` rather than guessing when authority/CWV data is unavailable.

### Data model

See `supabase/migrations/0001_init.sql`. Multi-tenant via `clients` / `client_members` +
RLS (same pattern as AiSend). `audit_runs` → `audit_pages` (one row per compared page) →
`audit_comparisons` (one row per run: gaps, hypothesis, recommendations, scores).
`audit_usage` tracks per-run Anthropic/DataForSEO usage for cost visibility (Part C).

### Auth

Supabase Auth (email/password) — `src/app/login`. `supabase/migrations/0002_auth_provisioning.sql`
adds an `auth.users` trigger that auto-creates a `clients` row + `client_members` (owner)
row for every signup, so a brand-new account can submit an audit immediately with no
manual SQL. `src/middleware.ts` redirects unauthenticated visitors to `/login` for every
non-API route.

### Multi-workspace

A user can belong to more than one `client_members` row (the agency case — one login,
several client brands). `src/lib/workspace.ts` resolves the "active" workspace from the
`active_client_id` cookie (verified against real membership, never trusted blindly),
falling back to the first one; `src/app/workspace-switcher.tsx` + `workspace-actions.ts`
let a signed-in user switch between their workspaces or spin up an additional one.
`POST /api/audits` always resolves `client_id` from this active workspace server-side —
it never trusts a client_id from the request body.

## Setup

1. **Supabase**
   - Create a project, enable the `vector` extension (the migration does this too).
   - Run `supabase/migrations/0001_init.sql` then `0002_auth_provisioning.sql` against it,
     in that order (Supabase SQL editor, or the Supabase CLI: `supabase db push`).
   - In Authentication → Providers → Email, "Confirm email" is on by default — either
     leave it on (users confirm via the email Supabase sends before their first sign-in)
     or turn it off for faster local testing.
2. **Environment variables** — copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (required — most modules call Claude)
   - `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` (optional — authority module is skipped,
     marked provisional, if unset)
   - `VOYAGE_API_KEY` (optional — semantic proximity reported as missing_data if unset)
3. **Install + run**
   ```bash
   npm install
   npm run dev
   ```
4. **Vercel** — import the repo, set the same env vars in the project settings, deploy.
   The audit-trigger route uses `waitUntil()` from `@vercel/functions` so the pipeline
   keeps running after the HTTP response returns (`maxDuration = 300` in
   `src/app/api/audits/route.ts`). If real audits exceed what fits comfortably there,
   move `runAuditPipeline` (unchanged) onto a standalone worker process per the spec's
   Part B3 guidance — it only depends on env vars + Supabase, not the request lifecycle.

## API

Requires an authenticated Supabase session (cookie-based — the dashboard calls these
directly from the browser after sign-in).

```
POST /api/audits
{ "target_keyword": "...", "pages": [{ "url": "..." }, { "url": "..." }] }
-> 202 { "status": "pending", "audit_run_id": "<uuid>" }

GET /api/audits/{audit_run_id}
-> { "status": "pending" | "running" }              while in progress
-> { "status": "failed", "error": "..." }           on failure
-> AuditReportResponse (Part E shape)                once complete
```

## What's implemented vs. deferred

Implemented (Phase 1 + thin vertical slice, spec D1/D2): full pipeline wiring end-to-end,
Supabase schema + RLS, on-page/schema/social/technical extraction, content architecture
mapping, entity + relationship extraction, sentiment/E-E-A-T/experience/local Claude
modules, deterministic weighted scoring with provisional-module handling, gap
classification, guardrail-constrained ranking hypothesis + recommendations, JSON report
API, minimal dashboard.

Known gaps / v1.1+ (see spec Part D1 phases 3, 5, 8 and Part F):
- Core Web Vitals / Lighthouse integration (`technical.core_web_vitals` is currently
  always null — needs a PageSpeed Insights or Lighthouse CI call).
- DataForSEO integration covers `backlinks/summary` only; referring-domain quality,
  anchor-text distribution, and backlinks-to-competing-URLs endpoints are stubbed.
- Scoring weights (`src/lib/config/scoring-weights.ts`) and module-scorer heuristics
  (`src/modules/scoring/module-scorers.ts`) are v1 heuristics — tune against real client
  data before relying on absolute score values.
- No "invite a teammate to an existing client" flow yet — an agency user can create and
  switch between several of their own workspaces (`src/app/workspace-switcher.tsx`,
  `src/app/workspace-actions.ts`), but adding a *second person* to a client they didn't
  create isn't built. Would need an invite/pending-membership table.
- Scoring weight calibration (`src/modules/calibration`) needs real accumulated
  `rank_history` data before its suggestions mean anything — see that module's own
  doc comment.
