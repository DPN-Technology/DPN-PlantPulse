import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { getPlatformRuntimeConfig } from "./platformConfig";
import { DpnIdentitySession } from "./types";
import { isIdentitySessionUsable } from "./identity";
import { oidcProfileFromClaims, oidcTokenExpiryIso } from "./oidcModel";

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
  if (!client.discovery.userInfoEndpoint) {
    throw new Error("DPN Identity discovery document is missing the UserInfo endpoint.");
  }

  const info = await AuthSession.fetchUserInfoAsync(
    { accessToken: token.accessToken },
    client.discovery
  );
  const profile = oidcProfileFromClaims(info as Record<string, unknown>, runtime.tenantClaim);

  return {
    status: "AUTHENTICATED",
    provider: "oidc",
    profile,
    accessToken: token.accessToken,
    ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
    expiresAt: oidcTokenExpiryIso(token.issuedAt, token.expiresIn),
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
    expiresAt: oidcTokenExpiryIso(token.issuedAt, token.expiresIn),
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
