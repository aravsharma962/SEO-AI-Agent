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
| Page crawl / extraction | Code | `src/modules/extraction` |
| Content architecture mapping | Code | `src/modules/content-architecture` |
| Entity extraction + relationships | Claude | `src/modules/entities` |
| Semantic proximity | Code (pgvector-ready, Voyage embeddings) | `src/modules/semantic` |
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
manual SQL. `POST /api/audits` resolves `client_id` server-side from the caller's own
membership — it never trusts a client_id from the request body. `src/middleware.ts`
redirects unauthenticated visitors to `/login` for every non-API route.

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
- Auth is single-workspace-per-user only (one `client_members` row per signup, picked
  automatically). Agencies managing multiple clients need a workspace switcher — not
  built yet.
- Semantic proximity (`src/modules/semantic`) has working embed/cosine-similarity
  helpers and a pgvector column (`audit_pages.embedding`) ready for them, but the
  pipeline doesn't call them yet — entity/relationship-depth scoring is used instead.
  Wire `embedText()` into `pipeline.ts` and store the result in that column next.
