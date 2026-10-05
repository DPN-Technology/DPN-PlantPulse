export interface PlatformConfig {
  host: string;
  port: number;
  databaseUrl: string;
  auth: {
    issuer: string;
    audience: string;
    jwksUrl: string;
    tenantClaim: string;
  };
  objectStore: {
    region: string;
    bucket: string;
    endpoint?: string;
    forcePathStyle: boolean;
    uploadTtlSeconds: number;
    maxUploadBytes: number;
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(name + " must be a positive integer");
  }
  return parsed;
}

export function loadConfig(): PlatformConfig {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  return {
    host: process.env.HOST?.trim() || "0.0.0.0",
    port: positiveInt("PORT", 8787),
    databaseUrl: required("DATABASE_URL"),
    auth: {
      issuer: required("DPN_IDENTITY_ISSUER"),
      audience: required("DPN_IDENTITY_AUDIENCE"),
      jwksUrl: required("DPN_IDENTITY_JWKS_URL"),
      tenantClaim: process.env.DPN_TENANT_CLAIM?.trim() || "tenant_id"
    },
    objectStore: {
      region: process.env.S3_REGION?.trim() || "us-east-1",
      bucket: required("S3_BUCKET"),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      uploadTtlSeconds: positiveInt("S3_UPLOAD_TTL_SECONDS", 900),
      maxUploadBytes: positiveInt("MAX_IMAGE_UPLOAD_BYTES", 15 * 1024 * 1024)
    }
  };
}
