# DPN PlantPulse — DPN Identity / OIDC Client

PlantPulse v0.9 implements a standards-based public mobile OIDC client intended to integrate with DPN One when DPN One's production authorization server is deployed.

## Current boundary

The **PlantPulse client implementation is real**.

The current DPN One repository describes OIDC/OAuth-compatible authorization-server capability as future production-roadmap work. PlantPulse therefore does not claim a live DPN One issuer today.

## Flow

```text
PlantPulse
  -> OpenID Connect discovery
  -> Authorization endpoint
     -> system browser / authentication session
     -> Authorization Code + PKCE (S256)
  -> Token endpoint
     -> short-lived access token
     -> refresh token when granted
  -> UserInfo endpoint
     -> sub
     -> display name / username
     -> email
     -> tenant claim
  -> SecureStore
     -> access token
     -> refresh token
     -> expiry metadata
```

PlantPulse never embeds or requires an OAuth client secret. A native/mobile application is a public client.

## Public build configuration

```text
EXPO_PUBLIC_DPN_IDENTITY_ISSUER=
EXPO_PUBLIC_DPN_IDENTITY_CLIENT_ID=
EXPO_PUBLIC_DPN_IDENTITY_SCOPES=openid profile email offline_access
EXPO_PUBLIC_DPN_IDENTITY_TENANT_CLAIM=tenant_id
```

These values are public application metadata. Do not place credentials or secrets in them.

## Redirect URI

PlantPulse uses its existing app scheme:

```text
plantpulse://auth/callback
```

The production DPN One client registration must allow the exact redirect URI used by the signed Android/iOS build.

## Provider requirements

The issuer discovery document must expose:

- authorization endpoint
- token endpoint
- UserInfo endpoint
- JWKS metadata used by the PlantPulse platform service
- revocation endpoint recommended for logout/revocation

PlantPulse requests Authorization Code flow with PKCE and the configured scopes.

## Session lifecycle

### Sign in

1. Discovery metadata is prepared before the user presses sign in.
2. PlantPulse opens the provider in the system authentication browser.
3. PKCE state/verifier protect the authorization-code exchange.
4. The returned code is exchanged at the token endpoint.
5. UserInfo supplies the display identity.
6. Credentials are stored in native SecureStore.

### Refresh

PlantPulse considers an access token unusable shortly before expiration. If an OIDC refresh token is available, the app requests a new access token and updates SecureStore.

A temporary refresh failure:

- discards the stale access token;
- preserves the refresh token;
- marks the session expired;
- allows a later retry rather than silently converting the failure into account deletion.

### Logout

PlantPulse attempts provider revocation when the discovery document exposes a revocation endpoint, then clears local secure credentials even if the remote revocation request is unavailable.

## Storage boundary

**SecureStore (native only):**
- access token
- refresh token
- expiry
- provider metadata needed for the session

**AsyncStorage platform state:**
- non-secret profile metadata
- provider label
- expiry metadata
- sync/device/conflict state

Bearer and refresh tokens are deliberately stripped before AsyncStorage persistence.

On web, credentials remain runtime-only in the current implementation.

## Server trust boundary

PlantPulse mobile UserInfo is presentation context. Authorization remains server-side.

The PlantPulse platform service validates access tokens through configured:

- issuer
- audience
- JWKS signature
- tenant claim

A display profile on the device does not grant server access by itself.

## DPN One work still required

Before DPN One can serve as the production PlantPulse authority, DPN One still needs its roadmap identity work, including:

- persistent user/organization/session storage
- OIDC/OAuth-compatible authorization server
- PlantPulse client registration
- signed JWKS key lifecycle/rotation
- audience-restricted access tokens
- refresh/revocation policy
- login/session audit
- MFA/passkey policy
- device trust and administrative revocation

## Security rules

- never embed a client secret in PlantPulse;
- never put tokens in `EXPO_PUBLIC_*`;
- production issuer must use TLS;
- redirect URI must be allowlisted exactly;
- request only required scopes;
- keep access tokens short-lived;
- rotate/expire refresh credentials according to DPN Identity policy;
- server authorization must never trust client-side profile fields.
