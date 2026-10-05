import assert from "node:assert/strict";
import test from "node:test";
import { uploadPendingPlantMedia } from "../src/mediaSync";
import {
  acceptRemoteConflictVersion,
  keepLocalConflictVersion,
  synchronizePlants
} from "../src/platformSync";
import { PlatformApiClient } from "../src/services/platformApi";
import { Plant, RegisteredClientDevice } from "../src/types";

function plant(id: string, state: Plant["sync"]["state"] = "DIRTY"): Plant {
  return {
    id,
    nickname: "Test Plant",
    commonName: "Monstera",
    scientificName: "Monstera deliciosa",
    location: "Lab",
    healthScore: 80,
    imageUri: "file:///plant.jpg",
    nextWaterAt: "2026-10-06T00:00:00.000Z",
    nextFeedAt: "2026-10-10T00:00:00.000Z",
    carePlan: { waterIntervalDays: 7, feedIntervalDays: 30 },
    toxicity: "Prototype",
    scanHistory: [{
      id: "scan-1",
      createdAt: "2026-10-05T00:00:00.000Z",
      mode: "health",
      imageUri: "file:///scan.jpg",
      commonName: "Monstera",
      scientificName: "Monstera deliciosa",
      identificationConfidence: 92,
      identificationStatus: "CONFIDENT",
      confidenceBand: "HIGH",
      speciesCandidates: [],
      healthScore: 80,
      band: "HEALTHY",
      breakdown: { leaf: 80, hydration: 80, light: 80, diseaseRisk: 10, pestRisk: 10, nutrition: 80 },
      captureQuality: { score: 90, issues: [], guidance: [] },
      evidence: [],
      findings: [],
      observations: [],
      actions: [],
      toxicity: "Prototype",
      engine: "local-prototype",
      modelVersion: "test",
      prototype: true,
      imageSyncState: "LOCAL_ONLY"
    }],
    timeline: [],
    recommendationFeedback: [],
    sensorDevices: [],
    sensorReadings: [],
    sensorAlerts: [],
    sync: {
      state,
      localRevision: 2,
      remoteRevision: 1,
      updatedAt: "2026-10-05T00:00:00.000Z"
    }
  };
}

class MediaApi implements PlatformApiClient {
  grants = 0;
  async pullPlants() { return []; }
  async pushPlant() { return { remoteRevision: 1, updatedAt: new Date().toISOString() }; }
  async requestImageUpload(contentType: string) {
    this.grants += 1;
    return {
      objectKey: "objects/" + this.grants + ".jpg",
      uploadUrl: "https://upload.invalid/" + this.grants,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      headers: { "Content-Type": contentType }
    };
  }
  async registerDevice(): Promise<RegisteredClientDevice> {
    throw new Error("unused");
  }
  async claimPlantTag(): Promise<void> {}
}

test("pending local plant images are uploaded before cloud serialization", async () => {
  const api = new MediaApi();
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("file://")) {
      return new Response(new Blob(["image"], { type: "image/jpeg" }), { status: 200 });
    }
    if (url.startsWith("https://upload.invalid/")) {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;

  const result = await uploadPendingPlantMedia([plant("plant-1")], api, fetcher);
  assert.equal(result.uploadedImages, 2);
  assert.equal(result.failedImages, 0);
  assert.equal(result.plants[0]!.cloudImageKey, "objects/1.jpg");
  assert.equal(result.plants[0]!.scanHistory[0]!.cloudImageKey, "objects/2.jpg");
  assert.equal(result.plants[0]!.scanHistory[0]!.imageSyncState, "UPLOADED");
});

test("sync captures remote snapshot and both conflict strategies are explicit", async () => {
  const local = plant("plant-1");
  const remote = {
    ...plant("plant-1", "SYNCED"),
    nickname: "Remote Plant",
    healthScore: 91,
    sync: {
      state: "SYNCED" as const,
      localRevision: 2,
      remoteRevision: 2,
      updatedAt: "2026-10-05T01:00:00.000Z",
      lastSyncedAt: "2026-10-05T01:00:00.000Z"
    }
  };

  const api: PlatformApiClient = {
    async pullPlants() {
      return [{
        plant: remote,
        remoteRevision: 2,
        updatedAt: "2026-10-05T01:00:00.000Z"
      }];
    },
    async pushPlant() {
      throw new Error("push should be blocked by conflict");
    },
    async requestImageUpload() {
      throw new Error("unused");
    },
    async registerDevice() {
      throw new Error("unused");
    },
    async claimPlantTag() {}
  };

  const result = await synchronizePlants([local], api);
  assert.equal(result.conflicts.length, 1);
  const conflict = result.conflicts[0]!;
  assert.equal(conflict.remotePlant?.nickname, "Remote Plant");
  assert.equal(result.plants[0]!.sync.state, "CONFLICT");

  const keepLocal = keepLocalConflictVersion(result.plants[0]!, conflict);
  assert.equal(keepLocal.sync.state, "DIRTY");
  assert.equal(keepLocal.sync.remoteRevision, 2);
  assert.equal(keepLocal.nickname, "Test Plant");

  const useRemote = acceptRemoteConflictVersion(conflict);
  assert.equal(useRemote.sync.state, "SYNCED");
  assert.equal(useRemote.sync.remoteRevision, 2);
  assert.equal(useRemote.nickname, "Remote Plant");
});
