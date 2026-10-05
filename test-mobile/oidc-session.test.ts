import assert from "node:assert/strict";
import test from "node:test";
import {
  oidcProfileFromClaims,
  oidcSessionCanRenew,
  oidcTokenExpiryIso
} from "../src/oidcModel";
import { isIdentitySessionUsable } from "../src/identity";

test("OIDC profile maps standard and DPN tenant claims", () => {
  const profile = oidcProfileFromClaims({
    sub: "user-123",
    name: "Plant Operator",
    email: "operator@example.test",
    tenant_id: "tenant-9"
  }, "tenant_id");

  assert.deepEqual(profile, {
    userId: "user-123",
    displayName: "Plant Operator",
    email: "operator@example.test",
    tenantId: "tenant-9"
  });
});

test("OIDC profile refuses claims without a subject", () => {
  assert.throws(
    () => oidcProfileFromClaims({ email: "missing@example.test" }, "tenant_id"),
    /did not include sub/
  );
});

test("OIDC token expiry uses provider issue time and lifetime", () => {
  assert.equal(
    oidcTokenExpiryIso(1_700_000_000, 3600),
    new Date(1_700_003_600 * 1000).toISOString()
  );
});

test("renewable OIDC sessions can survive an expired access token", () => {
  const expired = {
    status: "EXPIRED" as const,
    provider: "oidc" as const,
    profile: { userId: "user-1", displayName: "User" },
    refreshToken: "refresh",
    expiresAt: new Date(Date.now() - 60_000).toISOString()
  };

  assert.equal(isIdentitySessionUsable(expired), false);
  assert.equal(oidcSessionCanRenew(expired), true);
});

test("development sessions are never classified as OIDC renewable", () => {
  assert.equal(oidcSessionCanRenew({
    status: "AUTHENTICATED",
    provider: "development",
    profile: { userId: "dev", displayName: "Dev" },
    accessToken: "dev-token",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString()
  }), false);
});
