export const DEFAULT_EVENT_NAME = "TapSurge Challenge";
export const DEFAULT_DURATION_SECONDS = 30;
export const DEFAULT_THEME_COLOR = "#4ade80";

export type ThemeMode = "auto" | "default";

export interface BoothSettings {
  eventName: string;
  durationSeconds: number;
  logoDataUrl: string | null;
  themeMode: ThemeMode;
  autoColor: string | null;
}

const KEYS = {
  eventName: "tapsurge:booth:eventName",
  durationSeconds: "tapsurge:booth:durationSeconds",
  logoDataUrl: "tapsurge:booth:logoDataUrl",
  themeMode: "tapsurge:booth:themeMode",
  autoColor: "tapsurge:booth:autoColor",
} as const;

export function loadBoothSettings(): BoothSettings {
  const duration = Number(localStorage.getItem(KEYS.durationSeconds));
  const themeMode = localStorage.getItem(KEYS.themeMode);

  return {
    eventName: localStorage.getItem(KEYS.eventName) || DEFAULT_EVENT_NAME,
    durationSeconds: [10, 30, 60].includes(duration) ? duration : DEFAULT_DURATION_SECONDS,
    logoDataUrl: localStorage.getItem(KEYS.logoDataUrl),
    themeMode: themeMode === "auto" ? "auto" : "default",
    autoColor: localStorage.getItem(KEYS.autoColor),
  };
}

export function saveBoothSettings(settings: BoothSettings): void {
  localStorage.setItem(KEYS.eventName, settings.eventName.trim() || DEFAULT_EVENT_NAME);
  localStorage.setItem(KEYS.durationSeconds, String(settings.durationSeconds));
  localStorage.setItem(KEYS.themeMode, settings.themeMode);

  if (settings.logoDataUrl) {
    localStorage.setItem(KEYS.logoDataUrl, settings.logoDataUrl);
  } else {
    localStorage.removeItem(KEYS.logoDataUrl);
  }

  if (settings.autoColor) {
    localStorage.setItem(KEYS.autoColor, settings.autoColor);
  } else {
    localStorage.removeItem(KEYS.autoColor);
  }
}

export function resetBoothSettings(): BoothSettings {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  return loadBoothSettings();
}

export function resolveThemeColor(settings: BoothSettings): string {
  return settings.themeMode === "auto" && settings.autoColor
    ? settings.autoColor
    : DEFAULT_THEME_COLOR;
}

export function applyThemeColor(color: string): void {
  document.documentElement.style.setProperty("--theme-color", color);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

export async function extractPrimaryColor(dataUrl: string): Promise<string | null> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, size, size);
  const scale = Math.min(size / image.width, size / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

  const pixels = context.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { r: number; g: number; b: number; count: number; score: number }>();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 160) {
      continue;
    }

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = max - min;

    if (brightness < 32 || brightness > 235 || saturation < 24) {
      continue;
    }

    const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0, score: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    bucket.score += saturation;
    buckets.set(key, bucket);
  }

  let best: { r: number; g: number; b: number; count: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count * bucket.score > best.count * best.score) {
      best = bucket;
    }
  }

  if (!best || best.count === 0) {
    return null;
  }

  return rgbToHex(
    Math.round(best.r / best.count),
    Math.round(best.g / best.count),
    Math.round(best.b / best.count),
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
