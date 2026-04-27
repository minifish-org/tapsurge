import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_EVENT_NAME,
  DEFAULT_THEME_COLOR,
  applyThemeColor,
  extractPrimaryColor,
  fileToDataUrl,
  loadBoothSettings,
  resetBoothSettings,
  resolveThemeColor,
  saveBoothSettings,
  type BoothSettings,
  type ThemeMode,
} from "./settings";

const DURATIONS = [10, 30, 60];

export function renderAdminPage(container: HTMLElement, onBack: () => void): () => void {
  let draft = loadBoothSettings();
  const controller = new AbortController();
  const cleanup = (): void => controller.abort();
  const leave = (): void => {
    cleanup();
    onBack();
  };
  applyThemeColor(resolveThemeColor(draft));

  const render = (): void => {
    const themeColor = resolveThemeColor(draft);
    applyThemeColor(themeColor);
    container.innerHTML = `
      <main class="admin-shell">
        <section class="admin-card">
          <div class="admin-header">
            ${renderLogo(draft)}
            <div>
              <p class="admin-kicker">Booth Setup</p>
              <h1>Setup</h1>
            </div>
          </div>

          <label class="field">
            <span>Event Name</span>
            <input id="event-name" type="text" value="${escapeHtml(draft.eventName)}" autocomplete="off" />
          </label>

          <div class="field">
            <span>Duration</span>
            <div class="segmented">
              ${DURATIONS.map(
                (seconds) => `
                  <button class="duration-button ${seconds === draft.durationSeconds ? "selected" : ""}" data-admin-duration="${seconds}">
                    ${seconds}s
                  </button>
                `,
              ).join("")}
            </div>
          </div>

          <label class="field">
            <span>Logo Upload</span>
            <input id="logo-upload" type="file" accept="image/png,image/jpeg,image/svg+xml" />
          </label>

          <div class="field">
            <span>Theme Mode</span>
            <div class="segmented">
              ${themeButton("default", "Default", draft.themeMode)}
              ${themeButton("auto", "Auto", draft.themeMode)}
            </div>
          </div>

          <section class="preview-card">
            ${renderLogo(draft)}
            <div>
              <strong>${escapeHtml(draft.eventName)}</strong>
              <span>${draft.durationSeconds}s · ${draft.themeMode === "auto" ? "Auto" : "Default"}</span>
            </div>
            <i style="background:${themeColor}" aria-label="Final theme color"></i>
          </section>

          <div class="admin-actions">
            <button class="secondary-button" data-admin-action="back">Back</button>
            <button class="secondary-button" data-admin-action="reset-settings">Reset Settings</button>
            <button class="primary-button" data-admin-action="save">Save and Back</button>
          </div>
        </section>
      </main>
    `;
  };

  render();

  container.addEventListener(
    "input",
    (event) => {
      const target = event.target as HTMLInputElement;
      if (target.id === "event-name") {
        draft = { ...draft, eventName: target.value || DEFAULT_EVENT_NAME };
        updatePreview(container, draft);
      }
    },
    { signal: controller.signal },
  );

  container.addEventListener(
    "change",
    (event) => {
      const target = event.target as HTMLInputElement;
      if (target.id === "logo-upload" && target.files?.[0]) {
        void updateLogo(target.files[0]);
      }
    },
    { signal: controller.signal },
  );

  container.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement;
      const duration = target.closest<HTMLButtonElement>("[data-admin-duration]");
      const themeMode = target.closest<HTMLButtonElement>("[data-theme-mode]")?.dataset
        .themeMode as ThemeMode | undefined;
      const action = target.closest<HTMLButtonElement>("[data-admin-action]")?.dataset.adminAction;

      if (duration) {
        draft = { ...draft, durationSeconds: Number(duration.dataset.adminDuration) };
        render();
      } else if (themeMode) {
        draft = { ...draft, themeMode };
        render();
      } else if (action === "save") {
        saveBoothSettings(normalizeDraft(draft));
        leave();
      } else if (action === "back") {
        leave();
      } else if (action === "reset-settings") {
        draft = resetBoothSettings();
        render();
      }
    },
    { signal: controller.signal },
  );

  async function updateLogo(file: File): Promise<void> {
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      return;
    }

    const logoDataUrl = await fileToDataUrl(file);
    const autoColor = await extractPrimaryColor(logoDataUrl).catch(() => null);
    draft = { ...draft, logoDataUrl, autoColor };
    render();
  }

  return cleanup;
}

function normalizeDraft(settings: BoothSettings): BoothSettings {
  return {
    eventName: settings.eventName.trim() || DEFAULT_EVENT_NAME,
    durationSeconds: settings.durationSeconds || DEFAULT_DURATION_SECONDS,
    logoDataUrl: settings.logoDataUrl,
    themeMode: settings.themeMode,
    autoColor: settings.autoColor || null,
  };
}

function themeButton(value: ThemeMode, label: string, selected: ThemeMode): string {
  return `
    <button class="duration-button ${value === selected ? "selected" : ""}" data-theme-mode="${value}">
      ${label}
    </button>
  `;
}

function renderLogo(settings: BoothSettings): string {
  if (!settings.logoDataUrl) {
    return `<div class="logo-placeholder" style="border-color:${DEFAULT_THEME_COLOR}">TS</div>`;
  }
  return `<img class="booth-logo" src="${settings.logoDataUrl}" alt="" />`;
}

function updatePreview(container: HTMLElement, draft: BoothSettings): void {
  const preview = container.querySelector(".preview-card strong");
  if (preview) {
    preview.textContent = draft.eventName || DEFAULT_EVENT_NAME;
  }
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
