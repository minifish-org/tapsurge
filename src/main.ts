import "./styles.css";
import { renderAdminPage } from "./admin";
import { TapRun, type TapAreaBounds } from "./game";
import {
  applyThemeColor,
  loadBoothSettings,
  resolveThemeColor,
  type BoothSettings,
} from "./settings";
import { saveRun } from "./storage";

type Phase = "armed" | "running" | "done";

let boothSettings = loadBoothSettings();
let selectedDurationSeconds = boothSettings.durationSeconds;
let run = new TapRun(selectedDurationSeconds * 1000);
let animationFrame = 0;
let tapPulseTimer = 0;
let brandTapTimes: number[] = [];
let routeCleanup: (() => void) | null = null;
let resultSaved = false;
let phase: Phase = "armed";

const app = document.querySelector<HTMLDivElement>("#app")!;

renderRoute();
registerServiceWorker();

window.addEventListener("popstate", renderRoute);

function renderRoute(): void {
  cancelAnimationFrame(animationFrame);
  routeCleanup?.();
  routeCleanup = null;
  if (window.location.pathname === "/admin") {
    app.classList.add("admin-route");
    routeCleanup = renderAdminPage(app, navigateToGame);
    return;
  }
  app.classList.remove("admin-route");
  boothSettings = loadBoothSettings();
  selectedDurationSeconds = boothSettings.durationSeconds;
  renderApp();
}

function renderApp(): void {
  applyThemeColor(resolveThemeColor(boothSettings));
  app.innerHTML = `
    <main class="app-shell">
      <header class="top-bar">
        <button class="brand-trigger" data-action="brand" aria-label="Booth setup hidden trigger">
          ${renderLogo(boothSettings)}
          <h1>${escapeHtml(boothSettings.eventName)}</h1>
        </button>
      </header>
      <section class="metrics-panel">
        <div class="metric"><span>Remaining</span><strong id="remaining">${selectedDurationSeconds.toFixed(2)}s</strong></div>
        <div class="metric"><span>Taps</span><strong id="taps">0</strong></div>
      </section>
      <section class="tap-zone" id="tap-zone" aria-label="Valid tap area">
        <div class="tap-message" id="tap-message">Ready</div>
        <div class="tap-submessage" id="tap-submessage">First valid tap starts the run</div>
      </section>
      <button class="primary-button reset-button" data-action="reset">Reset</button>
    </main>
  `;

  resetRun();
}

function tick(timeNow: number): void {
  if (run.maybeFinish(timeNow)) {
    finishAndSave();
    return;
  }

  const metrics = run.getMetrics(timeNow);
  updateMetrics(metrics.remainingMs, metrics.totalClicks);
  animationFrame = requestAnimationFrame(tick);
}

app.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;

  if (action === "brand") {
    handleBrandTap();
  } else if (action === "reset") {
    resetRun();
  }
});

app.addEventListener(
  "pointerdown",
  (event) => {
    const tapZone = document.querySelector<HTMLElement>("#tap-zone");
    if (!tapZone || phase === "done") {
      return;
    }

    event.preventDefault();
    const rect = tapZone.getBoundingClientRect();
    const area: TapAreaBounds = {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    };
    const accepted = run.pointerDown(
      event.pointerId,
      performance.now(),
      event.clientX,
      event.clientY,
      area,
    );
    if (accepted) {
      showTapEffect(tapZone, rect, event.clientX, event.clientY, event.pointerId);
      if (phase === "armed") {
        phase = "running";
        animationFrame = requestAnimationFrame(tick);
      }
      getElement("tap-message").textContent = "Tap";
      getElement("tap-submessage").textContent = "Keep fingers inside the safe zone";
    }
  },
  { passive: false },
);

for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
  window.addEventListener(eventName, (event) => run.pointerUp((event as PointerEvent).pointerId));
}

for (const eventName of ["blur", "pagehide"]) {
  window.addEventListener(eventName, () => invalidateRun("Window lost focus."));
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    invalidateRun("Page was hidden during the run.");
  }
});

document.addEventListener("contextmenu", (event) => event.preventDefault());

function showTapEffect(
  tapZone: HTMLElement,
  rect: DOMRect,
  clientX: number,
  clientY: number,
  pointerId: number,
): void {
  const effect = document.createElement("span");
  effect.className = "tap-effect";
  effect.style.left = `${clientX - rect.left}px`;
  effect.style.top = `${clientY - rect.top}px`;
  effect.style.setProperty("--tap-hue", String((pointerId * 67) % 360));
  tapZone.append(effect);
  tapZone.classList.remove("tap-zone-hit");
  void tapZone.offsetWidth;
  tapZone.classList.add("tap-zone-hit");
  window.clearTimeout(tapPulseTimer);
  tapPulseTimer = window.setTimeout(() => tapZone.classList.remove("tap-zone-hit"), 120);
  effect.addEventListener("animationend", () => effect.remove(), { once: true });
}

function resetRun(): void {
  cancelAnimationFrame(animationFrame);
  run = new TapRun(selectedDurationSeconds * 1000);
  run.arm(selectedDurationSeconds * 1000);
  resultSaved = false;
  phase = "armed";
  getElement("tap-message").textContent = "Ready";
  getElement("tap-submessage").textContent = "First valid tap starts the run";
  updateMetrics(selectedDurationSeconds * 1000, 0);
}

function invalidateRun(reason: string): void {
  if (phase !== "armed" && phase !== "running") {
    return;
  }

  run.invalidate(reason);
  if (run.getStatus() === "finished") {
    finishAndSave();
  }
}

function finishAndSave(): void {
  if (resultSaved) {
    return;
  }

  resultSaved = true;
  cancelAnimationFrame(animationFrame);
  const result = run.createResult();
  saveRun(result);
  phase = "done";
  updateMetrics(0, result.totalClicks);
  getElement("tap-message").textContent = `${result.totalClicks}`;
  getElement("tap-submessage").textContent = "Finished";
}

function updateMetrics(remainingMs: number, taps: number): void {
  getElement("remaining").textContent = `${(remainingMs / 1000).toFixed(2)}s`;
  getElement("taps").textContent = String(taps);
}

function handleBrandTap(): void {
  const now = performance.now();
  brandTapTimes = brandTapTimes.filter((time) => now - time <= 3000);
  brandTapTimes.push(now);

  if (brandTapTimes.length >= 5) {
    brandTapTimes = [];
    navigateToAdmin();
  }
}

function navigateToAdmin(): void {
  history.pushState(null, "", "/admin");
  renderRoute();
}

function navigateToGame(): void {
  history.pushState(null, "", "/");
  renderRoute();
}

function renderLogo(settings: BoothSettings): string {
  if (!settings.logoDataUrl) {
    return "";
  }
  return `<img class="player-logo" src="${settings.logoDataUrl}" alt="" />`;
}

function getElement<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function registerServiceWorker(): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is best-effort in dev; production builds still run without registration.
      });
    });
  }
}
