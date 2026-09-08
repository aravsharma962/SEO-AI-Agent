import * as XLSX from "xlsx";
import type { AuditReportResponse } from "@/types/audit";
import { getOptimizationLevel } from "@/lib/optimization-level";

/**
 * Writes an .xlsx workbook straight from a completed report. Uses the
 * npm-registry `xlsx` (SheetJS) package in write-only mode — this package
 * has known unpatched vulnerabilities (prototype pollution, ReDoS) in its
 * *parsing* code paths (`XLSX.read`/`XLSX.readFile`), which this file never
 * calls. Never add a read/parse path onto this package without switching to
 * SheetJS's own patched CDN build first.
 */
export function exportReportToExcel(report: AuditReportResponse) {
  if (!report.audit || !report.scores) return;

  const wb = XLSX.utils.book_new();

  const scoreRows = Object.entries(report.scores).map(([url, s]) => ({
    URL: url,
    Rank: s.observed_rank ?? "",
    Current: s.current,
    Level: getOptimizationLevel(s.current).label,
    Projected: s.projected ?? "",
    "Coverage %": s.coverage,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scoreRows), "Scores");

  const gapRows = report.audit.page_comparison.content_gaps.map((g) => ({
    Topic: g.topic,
    "Gap Type": g.gap_type,
    "Present On": g.present_on.join(", "),
    "Missing On": g.missing_on.join(", "),
    Recommendation: g.recommendation,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gapRows), "Content Gaps");

  const recRows = (report.recommendations ?? []).map((r) => ({
    Page: r.page_url,
    Priority: r.priority,
    Category: r.category,
    Action: r.action,
    Rationale: r.rationale,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recRows), "Recommendations");

  const hypoRows = (report.ranking_hypothesis ?? []).map((h) => ({
    Statement: h.statement,
    Confidence: h.confidence,
    "Evidence Type": h.evidence_type,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hypoRows), "Ranking Hypothesis");

  const missingRows = (report.missing_data ?? []).map((m) => ({ "Missing Data": m }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(missingRows), "Missing Data");

  const safeKeyword = report.keyword.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  XLSX.writeFile(wb, `seo-audit-${safeKeyword}.xlsx`);
}
