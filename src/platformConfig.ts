export interface PlatformRuntimeConfig {
  defaultBaseUrl?: string;
  expoProjectId?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcScopes: string[];
  oidcTenantClaim: string;
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
  const scopes = (process.env.EXPO_PUBLIC_DPN_IDENTITY_SCOPES ?? "openid profile email offline_access")
    .split(/\s+/)
    .map((item: string) => item.trim())
    .filter(Boolean);

  return {
    defaultBaseUrl: cleanBaseUrl(process.env.EXPO_PUBLIC_DPN_PLATFORM_BASE_URL),
    expoProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || undefined,
    oidcIssuer: cleanBaseUrl(process.env.EXPO_PUBLIC_DPN_IDENTITY_ISSUER),
    oidcClientId: process.env.EXPO_PUBLIC_DPN_IDENTITY_CLIENT_ID?.trim() || undefined,
    oidcScopes: scopes,
    oidcTenantClaim: process.env.EXPO_PUBLIC_DPN_IDENTITY_TENANT_CLAIM?.trim() || "tenant_id"
  };
}

export function normalizePlatformBaseUrl(value: string): string {
  const normalized = cleanBaseUrl(value);
  if (!normalized) throw new Error("DPN Platform URL is required");
  return normalized;
}


export function isOidcRuntimeConfigured(): boolean {
  const runtime = getPlatformRuntimeConfig();
  return Boolean(runtime.oidcIssuer && runtime.oidcClientId);
}
