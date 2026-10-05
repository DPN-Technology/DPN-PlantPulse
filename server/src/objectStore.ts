import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadGrant, UploadGrantInput } from "./types.js";

export interface ObjectStore {
  createUploadGrant(input: UploadGrantInput): Promise<UploadGrant>;
}

export interface S3ObjectStoreOptions {
  region: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  uploadTtlSeconds?: number;
  maxUploadBytes?: number;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly uploadTtlSeconds: number;
  private readonly maxUploadBytes: number;

  constructor(options: S3ObjectStoreOptions) {
    this.bucket = options.bucket;
    this.uploadTtlSeconds = options.uploadTtlSeconds ?? 900;
    this.maxUploadBytes = options.maxUploadBytes ?? 15 * 1024 * 1024;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false
    });
  }

  async createUploadGrant(input: UploadGrantInput): Promise<UploadGrant> {
    const extension = EXTENSIONS[input.contentType];
    if (!extension) {
      throw new Error("Unsupported image content type");
    }
    if (
      input.byteLength !== undefined &&
      (!Number.isInteger(input.byteLength) || input.byteLength <= 0 || input.byteLength > this.maxUploadBytes)
    ) {
      throw new Error("Image size is outside the allowed range");
    }

    const objectKey = [
      "tenants",
      safeSegment(input.tenantId),
      "users",
      safeSegment(input.userId),
      "plant-images",
      new Date().toISOString().slice(0, 10),
      randomUUID() + "." + extension
    ].join("/");

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadTtlSeconds
    });
    const expiresAt = new Date(Date.now() + this.uploadTtlSeconds * 1000).toISOString();

    return {
      objectKey,
      uploadUrl,
      expiresAt,
      headers: {
        "Content-Type": input.contentType
      }
    };
  }
}

export class FixedObjectStore implements ObjectStore {
  async createUploadGrant(input: UploadGrantInput): Promise<UploadGrant> {
    return {
      objectKey: "test/" + safeSegment(input.tenantId) + "/" + randomUUID() + ".jpg",
      uploadUrl: "https://upload.invalid/test",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      headers: { "Content-Type": input.contentType }
    };
  }
}
