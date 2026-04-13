import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type AppSettings = {
  appearance: {
    compactCards: boolean;
    showRiskHints: boolean;
  };
  workflow: {
    autoParseAfterUpload: boolean;
    openReportAfterDetection: boolean;
  };
  account: {
    displayName: string;
    role: string;
  };
  modeling: {
    currentProviderId: string | null;
  };
};

export const defaultAppSettings: AppSettings = {
  appearance: {
    compactCards: false,
    showRiskHints: true
  },
  workflow: {
    autoParseAfterUpload: true,
    openReportAfterDetection: true
  },
  account: {
    displayName: "AI",
    role: "个人研究用户"
  },
  modeling: {
    currentProviderId: null
  }
};

export function getAppSettingsPath() {
  return join(process.cwd(), "storage", "app-settings.json");
}

export async function readAppSettings() {
  try {
    const raw = await readFile(getAppSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      appearance: {
        ...defaultAppSettings.appearance,
        ...(parsed.appearance ?? {})
      },
      workflow: {
        ...defaultAppSettings.workflow,
        ...(parsed.workflow ?? {})
      },
      account: {
        ...defaultAppSettings.account,
        ...(parsed.account ?? {})
      },
      modeling: {
        ...defaultAppSettings.modeling,
        ...(parsed.modeling ?? {})
      }
    } satisfies AppSettings;
  } catch {
    return defaultAppSettings;
  }
}

export async function writeAppSettings(payload: AppSettings) {
  const path = getAppSettingsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}
