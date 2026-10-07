import assert from "node:assert/strict";
import test from "node:test";
import { DpnVisionApiClient } from "../src/services/plantIntelligence";
import type { ScanResult } from "../src/types";

const productionToxicity = "Known toxic to pets.";

function result(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id: "scan-1",
    createdAt: "2026-10-06T00:00:00.000Z",
    mode: "identify",
    imageUri: "file://plant.jpg",
    commonName: "Test Plant",
    scientificName: "Planta testii",
    identificationConfidence: 0.98,
    identificationStatus: "CONFIDENT",
    confidenceBand: "HIGH",
    speciesCandidates: [],
    healthScore: 92,
    band: "EXCELLENT",
    breakdown: {
      leaf: 92,
      hydration: 92,
      light: 92,
      diseaseRisk: 8,
      pestRisk: 8,
      nutrition: 92
    },
    captureQuality: { score: 95, issues: [], guidance: [] },
    evidence: [],
    findings: [],
    observations: [],
    actions: [],
    toxicity: productionToxicity,
    engine: "dpn-vision-api",
    modelVersion: "vision-prod-1",
    prototype: false,
    ...overrides
  };
}

async function withRemoteResult<T>(
  payload: unknown,
  run: (client: DpnVisionApiClient) => Promise<T>,
  trustedProductionModelVersions: readonly string[] = ["vision-prod-1"],
  verifyProductionModelEvidence?: (result: Readonly<ScanResult>) => Promise<boolean>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const OriginalFormData = globalThis.FormData;

  class TestFormData {
    append(): void {}
  }

  globalThis.FormData = TestFormData as unknown as typeof FormData;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => payload
  })) as unknown as typeof fetch;

  try {
    return await run(new DpnVisionApiClient({
      baseUrl: "https://vision.example.test",
      trustedProductionModelVersions,
      verifyProductionModelEvidence
    }));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = OriginalFormData;
  }
}

const request = { imageUri: "file://plant.jpg", mode: "identify" as const };

test("unversioned remote results fail closed to prototype", async () => {
  const scan = await withRemoteResult(result({ modelVersion: "" }), (client) => client.analyze(request));

  assert.equal(scan.prototype, true);
  assert.equal(scan.modelVersion, "unversioned-remote-model");
  assert.match(scan.toxicity, /not approved for production safety decisions/i);
  assert.doesNotMatch(scan.toxicity, /Known toxic to pets/);
});

test("unknown model versions remain prototype even when the payload claims production", async () => {
  const scan = await withRemoteResult(
    result({ modelVersion: "vision-unapproved-9", prototype: false }),
    (client) => client.analyze(request)
  );

  assert.equal(scan.prototype, true);
  assert.equal(scan.modelVersion, "vision-unapproved-9");
  assert.match(scan.toxicity, /do not rely on this scan/i);
});

test("whitespace model versions are treated as unversioned", async () => {
  const scan = await withRemoteResult(result({ modelVersion: "   " }), (client) => client.analyze(request));

  assert.equal(scan.prototype, true);
  assert.equal(scan.modelVersion, "unversioned-remote-model");
});

test("allowlisted and independently verified model versions may retain production status", async () => {
  const scan = await withRemoteResult(result(), (client) => client.analyze(request), ["vision-prod-1"], async () => true);

  assert.equal(scan.prototype, false);
  assert.equal(scan.modelVersion, "vision-prod-1");
  assert.equal(scan.toxicity, productionToxicity);
});

test("identification uncertainty overrides toxicity guidance even for a trusted model", async () => {
  const scan = await withRemoteResult(
    result({ identificationStatus: "REVIEW", identificationConfidence: 0.61 }),
    (client) => client.analyze(request),
    ["vision-prod-1"],
    async () => true
  );

  assert.equal(scan.prototype, false);
  assert.match(scan.toxicity, /not confident enough for toxicity decisions/i);
  assert.doesNotMatch(scan.toxicity, /Known toxic to pets/);
});

test("malformed remote scan payloads are rejected instead of trusted", async () => {
  await assert.rejects(
    () => withRemoteResult({ id: "scan-1", modelVersion: "vision-prod-1" }, (client) => client.analyze(request)),
    /invalid scan payload/i
  );
});

test("an empty trust allowlist keeps every remote model in prototype", async () => {
  const scan = await withRemoteResult(
    result({ modelVersion: "vision-prod-1", prototype: false }),
    (client) => client.analyze(request),
    []
  );

  assert.equal(scan.prototype, true);
  assert.match(scan.toxicity, /not approved for production safety decisions/i);
});


test("allowlisted model without independent evidence verifier remains prototype", async () => {
  const scan = await withRemoteResult(result(), (client) => client.analyze(request));
  assert.equal(scan.prototype, true);
  assert.match(scan.toxicity, /not approved for production safety decisions/i);
});

test("negative provenance or calibration verification fails closed", async () => {
  const scan = await withRemoteResult(result(), (client) => client.analyze(request), ["vision-prod-1"], async () => false);
  assert.equal(scan.prototype, true);
  assert.doesNotMatch(scan.toxicity, /Known toxic to pets/);
});

test("provenance verifier exceptions fail closed", async () => {
  const scan = await withRemoteResult(result(), (client) => client.analyze(request), ["vision-prod-1"], async () => {
    throw new Error("verification unavailable");
  });
  assert.equal(scan.prototype, true);
  assert.match(scan.toxicity, /not approved for production safety decisions/i);
});

test("unapproved versions cannot invoke a verifier to promote themselves", async () => {
  let calls = 0;
  const scan = await withRemoteResult(result({ modelVersion: "unknown" }), (client) => client.analyze(request), ["vision-prod-1"], async () => {
    calls++;
    return true;
  });
  assert.equal(calls, 0);
  assert.equal(scan.prototype, true);
});
