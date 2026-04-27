import type { RunResult } from "./game";

const STORAGE_PREFIX = "tapsurge:run:";

export interface RunSummary {
  id: string;
  startedAt: string;
  durationMs: number;
  totalClicks: number;
  averageCps: number;
  maxRealtimeCps: number;
  maxSimultaneousPointers: number;
  isValid: boolean;
}

export function saveRun(result: RunResult): void {
  localStorage.setItem(`${STORAGE_PREFIX}${result.id}`, JSON.stringify(result));
}

export function loadRun(id: string): RunResult | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RunResult;
  } catch {
    return null;
  }
}

export function listRuns(): RunSummary[] {
  const summaries: RunSummary[] = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(STORAGE_PREFIX)) {
      continue;
    }

    const id = key.slice(STORAGE_PREFIX.length);
    const run = loadRun(id);
    if (!run) {
      continue;
    }

    summaries.push({
      id: run.id,
      startedAt: run.startedAt,
      durationMs: run.durationMs,
      totalClicks: run.totalClicks,
      averageCps: run.averageCps,
      maxRealtimeCps: run.maxRealtimeCps,
      maxSimultaneousPointers: run.maxSimultaneousPointers,
      isValid: run.isValid,
    });
  }

  return summaries.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function deleteRun(id: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
}

export function exportRunJson(result: RunResult): void {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tapsurge-${result.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
