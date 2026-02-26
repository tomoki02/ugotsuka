const STORAGE_KEY = "appSettings";

export interface AppSettings {
  cameraDeviceId: string;
  squatMinutesPerRep: number;
}

const defaults: AppSettings = {
  cameraDeviceId: "",
  squatMinutesPerRep: 3,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      cameraDeviceId: typeof parsed.cameraDeviceId === "string" ? parsed.cameraDeviceId : defaults.cameraDeviceId,
      squatMinutesPerRep:
        typeof parsed.squatMinutesPerRep === "number" && parsed.squatMinutesPerRep >= 0
          ? parsed.squatMinutesPerRep
          : defaults.squatMinutesPerRep,
    };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  const current = loadSettings();
  const next: AppSettings = {
    ...current,
    ...settings,
  };
  if (typeof next.squatMinutesPerRep === "number" && next.squatMinutesPerRep < 0) {
    next.squatMinutesPerRep = defaults.squatMinutesPerRep;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
