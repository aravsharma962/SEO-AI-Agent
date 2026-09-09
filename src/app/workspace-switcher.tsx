"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspace, createWorkspace } from "./workspace-actions";
import type { WorkspaceSummary } from "@/lib/workspace";

export default function WorkspaceSwitcher({
  workspaces,
  activeClientId,
}: {
  workspaces: WorkspaceSummary[];
  activeClientId: string;
}) {
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSwitch(clientId: string) {
    if (clientId === activeClientId) return;
    setSwitching(true);
    await switchWorkspace(clientId);
    router.refresh();
    setSwitching(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await createWorkspace(newName);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNewName("");
    setCreating(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={activeClientId}
        disabled={switching}
        onChange={(e) => handleSwitch(e.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 disabled:opacity-50"
      >
        {workspaces.map((w) => (
          <option key={w.clientId} value={w.clientId}>
            {w.clientName}
          </option>
        ))}
      </select>

      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="text-xs text-slate-500 underline"
        >
          + New workspace
        </button>
      ) : (
        <form onSubmit={handleCreate} className="flex items-center gap-1.5">
          <input
            autoFocus
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Workspace name"
            className="rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <button type="submit" className="rounded bg-slate-900 px-2 py-1 text-xs text-white">
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setError(null);
            }}
            className="text-xs text-slate-400"
          >
            Cancel
          </button>
        </form>
      )}

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
