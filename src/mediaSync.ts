import { Plant, PlantScan } from "./types";
import { PlatformApiClient } from "./services/platformApi";

export interface MediaSyncResult {
  plants: Plant[];
  uploadedImages: number;
  failedImages: number;
}

export type FetchLike = typeof fetch;

function contentTypeFromUri(uri: string): string {
  const clean = uri.split("?")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function uploadLocalImage(
  uri: string,
  api: PlatformApiClient,
  fetcher: FetchLike
): Promise<string> {
  const local = await fetcher(uri);
  if (!local.ok) throw new Error("Could not read local PlantPulse image");
  const blob = await local.blob();
  const contentType = blob.type || contentTypeFromUri(uri);
  const grant = await api.requestImageUpload(contentType, blob.size || undefined);

  const uploaded = await fetcher(grant.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      ...(grant.headers ?? {})
    },
    body: blob
  });

  if (!uploaded.ok) {
    throw new Error("PlantPulse image upload failed with HTTP " + uploaded.status);
  }
  return grant.objectKey;
}

async function syncScan(
  scan: PlantScan,
  api: PlatformApiClient,
  fetcher: FetchLike
): Promise<{ scan: PlantScan; uploaded: number; failed: number }> {
  if (scan.cloudImageKey || !scan.imageUri || scan.imageUri.startsWith("cloud://")) {
    return { scan, uploaded: 0, failed: 0 };
  }

  try {
    const cloudImageKey = await uploadLocalImage(scan.imageUri, api, fetcher);
    return {
      scan: { ...scan, cloudImageKey, imageSyncState: "UPLOADED" },
      uploaded: 1,
      failed: 0
    };
  } catch {
    return {
      scan: { ...scan, imageSyncState: "ERROR" },
      uploaded: 0,
      failed: 1
    };
  }
}

export async function uploadPendingPlantMedia(
  inputPlants: Plant[],
  api: PlatformApiClient,
  fetcher: FetchLike = fetch
): Promise<MediaSyncResult> {
  let uploadedImages = 0;
  let failedImages = 0;
  const plants: Plant[] = [];

  for (const plant of inputPlants) {
    let cloudImageKey = plant.cloudImageKey;
    if (!cloudImageKey && plant.imageUri && !plant.imageUri.startsWith("cloud://")) {
      try {
        cloudImageKey = await uploadLocalImage(plant.imageUri, api, fetcher);
        uploadedImages += 1;
      } catch {
        failedImages += 1;
      }
    }

    const scanHistory: PlantScan[] = [];
    for (const scan of plant.scanHistory) {
      const result = await syncScan(scan, api, fetcher);
      scanHistory.push(result.scan);
      uploadedImages += result.uploaded;
      failedImages += result.failed;
    }

    plants.push({
      ...plant,
      ...(cloudImageKey ? { cloudImageKey } : {}),
      scanHistory
    });
  }

  return { plants, uploadedImages, failedImages };
}
