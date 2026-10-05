import { Plant, PlantScan } from "./types";
import { PlatformApiClient } from "./services/platformApi";
import { touchPlant } from "./syncState";

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
  plantId: string,
  mediaKind: "PLANT_PRIMARY" | "SCAN",
  uri: string,
  api: PlatformApiClient,
  fetcher: FetchLike
): Promise<string> {
  const local = await fetcher(uri);
  if (!local.ok) throw new Error("Could not read local PlantPulse image");
  const blob = await local.blob();
  const contentType = blob.type || contentTypeFromUri(uri);
  if (!blob.size) throw new Error("PlantPulse image has no readable byte length");
  const grant = await api.requestImageUpload(plantId, mediaKind, contentType, blob.size);

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

  const verified = await api.completeImageUpload(grant.uploadId);
  if (verified.status !== "VERIFIED" && verified.status !== "ATTACHED") {
    throw new Error("PlantPulse image was not verified by the platform");
  }
  return verified.objectKey;
}

export async function uploadPendingPlantMedia(
  inputPlants: Plant[],
  api: PlatformApiClient,
  fetcher: FetchLike = fetch
): Promise<MediaSyncResult> {
  let uploadedImages = 0;
  let failedImages = 0;
  const plants: Plant[] = [];
  const uploadedByPlantUri = new Map<string, string>();

  const uploadOnce = async (
    plantId: string,
    mediaKind: "PLANT_PRIMARY" | "SCAN",
    uri: string
  ): Promise<string> => {
    const cacheKey = plantId + "\u0000" + uri;
    const existing = uploadedByPlantUri.get(cacheKey);
    if (existing) return existing;
    const key = await uploadLocalImage(plantId, mediaKind, uri, api, fetcher);
    uploadedByPlantUri.set(cacheKey, key);
    uploadedImages += 1;
    return key;
  };

  for (const plant of inputPlants) {
    let cloudImageKey = plant.cloudImageKey;
    let mediaChanged = false;
    if (!cloudImageKey && plant.imageUri && !plant.imageUri.startsWith("cloud://")) {
      try {
        cloudImageKey = await uploadOnce(plant.id, "PLANT_PRIMARY", plant.imageUri);
        mediaChanged = true;
      } catch {
        failedImages += 1;
      }
    }

    const scanHistory: PlantScan[] = [];
    for (const scan of plant.scanHistory) {
      if (scan.cloudImageKey || !scan.imageUri || scan.imageUri.startsWith("cloud://")) {
        scanHistory.push(scan);
        continue;
      }

      try {
        const scanCloudImageKey = await uploadOnce(plant.id, "SCAN", scan.imageUri);
        scanHistory.push({
          ...scan,
          cloudImageKey: scanCloudImageKey,
          imageSyncState: "UPLOADED"
        });
        mediaChanged = true;
      } catch {
        failedImages += 1;
        scanHistory.push({
          ...scan,
          imageSyncState: "ERROR"
        });
      }
    }

    const nextPlant: Plant = {
      ...plant,
      ...(cloudImageKey ? { cloudImageKey } : {}),
      scanHistory
    };
    plants.push(mediaChanged ? touchPlant(nextPlant) : nextPlant);
  }

  return { plants, uploadedImages, failedImages };
}
