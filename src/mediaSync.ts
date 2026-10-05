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

export async function uploadPendingPlantMedia(
  inputPlants: Plant[],
  api: PlatformApiClient,
  fetcher: FetchLike = fetch
): Promise<MediaSyncResult> {
  let uploadedImages = 0;
  let failedImages = 0;
  const plants: Plant[] = [];
  const uploadedByUri = new Map<string, string>();

  const uploadOnce = async (uri: string): Promise<string> => {
    const existing = uploadedByUri.get(uri);
    if (existing) return existing;
    const key = await uploadLocalImage(uri, api, fetcher);
    uploadedByUri.set(uri, key);
    uploadedImages += 1;
    return key;
  };

  for (const plant of inputPlants) {
    let cloudImageKey = plant.cloudImageKey;
    if (!cloudImageKey && plant.imageUri && !plant.imageUri.startsWith("cloud://")) {
      try {
        cloudImageKey = await uploadOnce(plant.imageUri);
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
        const scanCloudImageKey = await uploadOnce(scan.imageUri);
        scanHistory.push({
          ...scan,
          cloudImageKey: scanCloudImageKey,
          imageSyncState: "UPLOADED"
        });
      } catch {
        failedImages += 1;
        scanHistory.push({
          ...scan,
          imageSyncState: "ERROR"
        });
      }
    }

    plants.push({
      ...plant,
      ...(cloudImageKey ? { cloudImageKey } : {}),
      scanHistory
    });
  }

  return { plants, uploadedImages, failedImages };
}
