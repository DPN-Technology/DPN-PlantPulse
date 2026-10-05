import { DpnIdentityProfile, DpnIdentitySession } from "./types";

export function oidcTokenExpiryIso(
  issuedAt?: number,
  expiresIn?: number,
  nowMs = Date.now()
): string {
  const baseSeconds = issuedAt ?? Math.floor(nowMs / 1000);
  const lifetimeSeconds = expiresIn ?? 3600;
  return new Date((baseSeconds + lifetimeSeconds) * 1000).toISOString();
}

function stringClaim(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function oidcProfileFromClaims(
  info: Record<string, unknown>,
  tenantClaim: string
): DpnIdentityProfile {
  const userId = stringClaim(info, "sub");
  if (!userId) throw new Error("DPN Identity user-info response did not include sub.");

  const email = stringClaim(info, "email");
  const tenantId = stringClaim(info, tenantClaim);

  return {
    userId,
    displayName:
      stringClaim(info, "name") ??
      stringClaim(info, "preferred_username") ??
      email ??
      userId,
    ...(email ? { email } : {}),
    ...(tenantId ? { tenantId } : {})
  };
}

export function oidcSessionCanRenew(session: DpnIdentitySession): boolean {
  return session.provider === "oidc" && Boolean(session.refreshToken);
}
