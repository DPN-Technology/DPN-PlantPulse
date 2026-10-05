import { PlantTag } from "./types";

const PREFIX = "plantpulse://plant/";

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createPlantTag(plantId: string): PlantTag {
  const tagId = "pptag-" + randomId();
  return {
    tagId,
    plantId,
    payload: PREFIX + encodeURIComponent(plantId) + "?tag=" + encodeURIComponent(tagId),
    createdAt: new Date().toISOString()
  };
}

export function parsePlantTagPayload(payload: string): PlantTag | null {
  if (!payload.startsWith(PREFIX)) return null;
  const rest = payload.slice(PREFIX.length);
  const queryIndex = rest.indexOf("?");
  const plantPart = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const query = queryIndex >= 0 ? rest.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  const tagId = params.get("tag");
  if (!plantPart || !tagId) return null;

  try {
    return {
      tagId,
      plantId: decodeURIComponent(plantPart),
      payload,
      createdAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
