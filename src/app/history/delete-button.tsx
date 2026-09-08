"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAuditButton({ auditRunId, keyword }: { auditRunId: string; keyword: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Delete this audit for "${keyword}"? This can't be undone.`)) return;

    setDeleting(true);
    const res = await fetch(`/api/audits/${auditRunId}`, { method: "DELETE" });
    setDeleting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message ?? "Could not delete this audit.");
      return;
    }

    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="text-sm text-red-600 underline disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
