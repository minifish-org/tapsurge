export const MAX_TAPS = 20_000;

export const SAFE_MARGINS = {
  left: 60,
  right: 60,
  top: 70,
  bottom: 90,
  innerInset: 12,
};

export type RunStatus = "idle" | "armed" | "running" | "finished";

export interface TapRecord {
  timeMs: number;
  pointerId: number;
}

export interface Metrics {
  elapsedMs: number;
  remainingMs: number;
  totalClicks: number;
  averageCps: number;
  realtimeCps: number;
  maxRealtimeCps: number;
  maxSimultaneousPointers: number;
  isValid: boolean;
  status: RunStatus;
}

export interface RunResult extends Metrics {
  id: string;
  startedAt: string;
  durationMs: number;
  tapTimesMs: number[];
  pointerIds: number[];
  invalidReason: string | null;
}

export interface TapAreaBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function isValidTap(
  x: number,
  y: number,
  area: TapAreaBounds,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): boolean {
  const insideViewportSafeArea =
    x >= SAFE_MARGINS.left &&
    x <= viewportWidth - SAFE_MARGINS.right &&
    y >= SAFE_MARGINS.top &&
    y <= viewportHeight - SAFE_MARGINS.bottom;

  const insideTapArea =
    x >= area.left + SAFE_MARGINS.innerInset &&
    x <= area.right - SAFE_MARGINS.innerInset &&
    y >= area.top + SAFE_MARGINS.innerInset &&
    y <= area.bottom - SAFE_MARGINS.innerInset;

  return insideViewportSafeArea && insideTapArea;
}

export class TapRun {
  private readonly tapTimes = new Float64Array(MAX_TAPS);
  private readonly pointerIds = new Int32Array(MAX_TAPS);
  private readonly activePointers = new Set<number>();
  private writeIndex = 0;
  private startTime = 0;
  private endTime = 0;
  private startedAt = "";
  private status: RunStatus = "idle";
  private isRunValid = true;
  private invalidReason: string | null = null;
  private maxSimultaneousPointers = 0;
  private maxRealtimeCps = 0;

  constructor(private durationMs: number) {}

  arm(durationMs = this.durationMs): void {
    this.durationMs = durationMs;
    this.writeIndex = 0;
    this.startTime = 0;
    this.endTime = 0;
    this.startedAt = "";
    this.status = "armed";
    this.isRunValid = true;
    this.invalidReason = null;
    this.maxSimultaneousPointers = 0;
    this.maxRealtimeCps = 0;
    this.activePointers.clear();
  }

  pointerDown(
    pointerId: number,
    timeNow: number,
    x: number,
    y: number,
    area: TapAreaBounds,
  ): boolean {
    if (this.activePointers.has(pointerId) || this.status === "finished") {
      return false;
    }

    this.activePointers.add(pointerId);

    if (!isValidTap(x, y, area)) {
      return false;
    }

    if (this.status === "armed") {
      this.start(timeNow);
    }

    if (this.status !== "running" || timeNow > this.endTime || !this.isRunValid) {
      return false;
    }

    this.maxSimultaneousPointers = Math.max(this.maxSimultaneousPointers, this.activePointers.size);
    return this.recordTap(timeNow, pointerId);
  }

  pointerUp(pointerId: number): void {
    this.activePointers.delete(pointerId);
  }

  invalidate(reason: string): void {
    if (this.status === "running" || this.status === "armed") {
      this.isRunValid = false;
      this.invalidReason = reason;
      this.finish();
    }
  }

  maybeFinish(timeNow: number): boolean {
    if (this.status === "running" && timeNow >= this.endTime) {
      this.finish();
      return true;
    }
    return false;
  }

  getMetrics(timeNow: number): Metrics {
    const elapsedMs = this.getElapsedMs(timeNow);
    const elapsedSeconds = elapsedMs > 0 ? elapsedMs / 1000 : 0;
    const averageCps = elapsedSeconds > 0 ? this.writeIndex / elapsedSeconds : 0;
    const realtimeCps = this.getRealtimeCps(elapsedMs);
    this.maxRealtimeCps = Math.max(this.maxRealtimeCps, realtimeCps);

    return {
      elapsedMs,
      remainingMs: Math.max(0, this.durationMs - elapsedMs),
      totalClicks: this.writeIndex,
      averageCps,
      realtimeCps,
      maxRealtimeCps: this.maxRealtimeCps,
      maxSimultaneousPointers: this.maxSimultaneousPointers,
      isValid: this.isRunValid,
      status: this.status,
    };
  }

  createResult(): RunResult {
    const tapTimesMs = Array.from(this.tapTimes.subarray(0, this.writeIndex));
    const pointerIds = Array.from(this.pointerIds.subarray(0, this.writeIndex));
    const averageCps = this.writeIndex / (this.durationMs / 1000);
    const maxRealtimeCps = Math.max(this.maxRealtimeCps, this.computeMaxRealtimeCps());

    return {
      id: createRunId(),
      startedAt: this.startedAt || new Date().toISOString(),
      durationMs: this.durationMs,
      elapsedMs: this.durationMs,
      remainingMs: 0,
      totalClicks: this.writeIndex,
      averageCps,
      realtimeCps: 0,
      maxRealtimeCps,
      maxSimultaneousPointers: this.maxSimultaneousPointers,
      isValid: this.isRunValid,
      status: "finished",
      tapTimesMs,
      pointerIds,
      invalidReason: this.invalidReason,
    };
  }

  getStatus(): RunStatus {
    return this.status;
  }

  private start(timeNow: number): void {
    this.startTime = timeNow;
    this.endTime = timeNow + this.durationMs;
    this.startedAt = new Date().toISOString();
    this.status = "running";
  }

  private finish(): void {
    this.status = "finished";
    this.activePointers.clear();
  }

  private recordTap(timeNow: number, pointerId: number): boolean {
    if (this.writeIndex >= MAX_TAPS) {
      this.invalidate("Tap buffer capacity exceeded.");
      return false;
    }

    this.tapTimes[this.writeIndex] = Math.max(0, timeNow - this.startTime);
    this.pointerIds[this.writeIndex] = pointerId;
    this.writeIndex += 1;
    return true;
  }

  private getElapsedMs(timeNow: number): number {
    if (this.status === "idle" || this.status === "armed" || this.startTime === 0) {
      return 0;
    }
    return Math.min(this.durationMs, Math.max(0, timeNow - this.startTime));
  }

  private getRealtimeCps(elapsedMs: number): number {
    const windowStart = Math.max(0, elapsedMs - 1000);
    let count = 0;

    // The tap buffer is append-only and sorted by time, so a reverse scan stops as soon as it
    // leaves the one-second sliding window.
    for (let index = this.writeIndex - 1; index >= 0; index -= 1) {
      if (this.tapTimes[index] < windowStart) {
        break;
      }
      count += 1;
    }

    return count;
  }

  private computeMaxRealtimeCps(): number {
    let maxCount = 0;
    let windowStartIndex = 0;

    for (let index = 0; index < this.writeIndex; index += 1) {
      const windowStartMs = this.tapTimes[index] - 1000;
      while (this.tapTimes[windowStartIndex] < windowStartMs) {
        windowStartIndex += 1;
      }
      maxCount = Math.max(maxCount, index - windowStartIndex + 1);
    }

    return maxCount;
  }
}

function createRunId(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${suffix}`;
}
