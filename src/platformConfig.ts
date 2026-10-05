export interface PlatformRuntimeConfig {
  defaultBaseUrl?: string;
  expoProjectId?: string;
}

function cleanBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("DPN Platform URL must start with http:// or https://");
  }
  return trimmed.replace(/\/$/, "");
}

export function getPlatformRuntimeConfig(): PlatformRuntimeConfig {
  return {
    defaultBaseUrl: cleanBaseUrl(process.env.EXPO_PUBLIC_DPN_PLATFORM_BASE_URL),
    expoProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || undefined
  };
}

export function normalizePlatformBaseUrl(value: string): string {
  const normalized = cleanBaseUrl(value);
  if (!normalized) throw new Error("DPN Platform URL is required");
  return normalized;
}
