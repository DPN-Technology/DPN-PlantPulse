import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { getPlatformRuntimeConfig } from "./platformConfig";
import { DpnIdentityProfile, DpnIdentitySession } from "./types";
import { isIdentitySessionUsable } from "./identity";

WebBrowser.maybeCompleteAuthSession();

export interface PreparedDpnOidcClient {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  discovery: AuthSession.DiscoveryDocument;
  request: AuthSession.AuthRequest;
}

function requiredOidcRuntime() {
  const runtime = getPlatformRuntimeConfig();
  if (!runtime.oidcIssuer || !runtime.oidcClientId) {
    throw new Error("DPN Identity OIDC is not configured in this build.");
  }
  return {
    issuer: runtime.oidcIssuer,
    clientId: runtime.oidcClientId,
    scopes: runtime.oidcScopes,
    tenantClaim: runtime.oidcTenantClaim
  };
}

function sessionExpiry(issuedAt?: number, expiresIn?: number): string {
  const baseSeconds = issuedAt ?? Math.floor(Date.now() / 1000);
  const lifetimeSeconds = expiresIn ?? 3600;
  return new Date((baseSeconds + lifetimeSeconds) * 1000).toISOString();
}

function stringClaim(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function profileFromUserInfo(
  info: Record<string, unknown>,
  tenantClaim: string
): DpnIdentityProfile {
  const userId = stringClaim(info, "sub");
  if (!userId) throw new Error("DPN Identity user-info response did not include sub.");

  return {
    userId,
    displayName:
      stringClaim(info, "name") ??
      stringClaim(info, "preferred_username") ??
      stringClaim(info, "email") ??
      userId,
    ...(stringClaim(info, "email") ? { email: stringClaim(info, "email") } : {}),
    ...(stringClaim(info, tenantClaim) ? { tenantId: stringClaim(info, tenantClaim) } : {})
  };
}

export async function prepareDpnOidcClient(): Promise<PreparedDpnOidcClient> {
  const runtime = requiredOidcRuntime();
  const discovery = await AuthSession.fetchDiscoveryAsync(runtime.issuer);
  if (!discovery.authorizationEndpoint || !discovery.tokenEndpoint) {
    throw new Error("DPN Identity discovery document is missing required OAuth endpoints.");
  }

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "plantpulse",
    path: "auth/callback"
  });

  const request = new AuthSession.AuthRequest({
    clientId: runtime.clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: runtime.scopes,
    usePKCE: true
  });
  await request.makeAuthUrlAsync(discovery);

  return {
    issuer: runtime.issuer,
    clientId: runtime.clientId,
    redirectUri,
    scopes: runtime.scopes,
    discovery,
    request
  };
}

export async function signInWithDpnOidc(
  client: PreparedDpnOidcClient
): Promise<DpnIdentitySession> {
  const result = await client.request.promptAsync(client.discovery);
  if (result.type !== "success") {
    throw new Error(result.type === "cancel" || result.type === "dismiss"
      ? "DPN Identity sign-in was cancelled."
      : "DPN Identity sign-in did not complete.");
  }

  const code = result.params.code;
  if (!code) throw new Error("DPN Identity did not return an authorization code.");
  if (!client.request.codeVerifier) throw new Error("PKCE code verifier is unavailable.");

  const token = await AuthSession.exchangeCodeAsync({
    clientId: client.clientId,
    code,
    redirectUri: client.redirectUri,
    extraParams: {
      code_verifier: client.request.codeVerifier
    }
  }, client.discovery);

  const runtime = requiredOidcRuntime();
  let profile: DpnIdentityProfile = {
    userId: "oidc-session",
    displayName: "DPN Identity"
  };

  if (client.discovery.userInfoEndpoint) {
    const info = await AuthSession.fetchUserInfoAsync(
      { accessToken: token.accessToken },
      client.discovery
    );
    profile = profileFromUserInfo(info as Record<string, unknown>, runtime.tenantClaim);
  }

  return {
    status: "AUTHENTICATED",
    provider: "oidc",
    profile,
    accessToken: token.accessToken,
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
    expiresAt: sessionExpiry(token.issuedAt, token.expiresIn),
    ...(token.tokenType ? { tokenType: token.tokenType } : {}),
    ...(token.scope ? { scope: token.scope } : {})
  };
}

export async function refreshDpnOidcSession(
  session: DpnIdentitySession
): Promise<DpnIdentitySession> {
  if (session.provider !== "oidc") return session;
  if (isIdentitySessionUsable(session)) return session;
  if (!session.refreshToken) {
    return {
      ...session,
      status: "EXPIRED",
      accessToken: undefined
    };
  }

  const runtime = requiredOidcRuntime();
  const discovery = await AuthSession.fetchDiscoveryAsync(runtime.issuer);
  if (!discovery.tokenEndpoint) throw new Error("DPN Identity token endpoint is unavailable.");

  const token = await AuthSession.refreshAsync({
    clientId: runtime.clientId,
    refreshToken: session.refreshToken,
    scopes: runtime.scopes
  }, discovery);

  return {
    ...session,
    status: "AUTHENTICATED",
    provider: "oidc",
    accessToken: token.accessToken,
    refreshToken: token.refreshToken ?? session.refreshToken,
    expiresAt: sessionExpiry(token.issuedAt, token.expiresIn),
    ...(token.tokenType ? { tokenType: token.tokenType } : {}),
    ...(token.scope ? { scope: token.scope } : {})
  };
}

export async function revokeDpnOidcSession(session: DpnIdentitySession): Promise<void> {
  if (session.provider !== "oidc") return;
  const token = session.refreshToken ?? session.accessToken;
  if (!token) return;

  const runtime = requiredOidcRuntime();
  const discovery = await AuthSession.fetchDiscoveryAsync(runtime.issuer);
  if (!discovery.revocationEndpoint) return;

  await AuthSession.revokeAsync({
    clientId: runtime.clientId,
    token
  }, discovery);
}
