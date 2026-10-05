import { DpnIdentityProfile, DpnIdentitySession } from "./types";

export function createRuntimeIdentitySession(
  profile: DpnIdentityProfile,
  accessToken: string,
  expiresAt: string
): DpnIdentitySession {
  if (!accessToken.trim()) throw new Error("Access token is required");
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    throw new Error("Identity session is already expired");
  }

  return {
    status: "AUTHENTICATED",
    profile,
    accessToken,
    expiresAt
  };
}

export function isIdentitySessionUsable(session: DpnIdentitySession): boolean {
  if (session.status !== "AUTHENTICATED" || !session.accessToken || !session.expiresAt) return false;
  return new Date(session.expiresAt).getTime() > Date.now() + 60_000;
}

export function expireIdentitySession(session: DpnIdentitySession): DpnIdentitySession {
  return {
    status: "EXPIRED",
    profile: session.profile,
    expiresAt: session.expiresAt
  };
}
