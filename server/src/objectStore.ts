import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  MediaObjectMetadata,
  RequestValidationError,
  UploadGrant,
  UploadGrantInput
} from "./types.js";

export interface ObjectStore {
  createUploadGrant(input: UploadGrantInput): Promise<UploadGrant>;
  inspectObject(objectKey: string): Promise<MediaObjectMetadata | undefined>;
  deleteObject(objectKey: string): Promise<void>;
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

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404;
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
    if (!extension) throw new RequestValidationError("Unsupported image content type");
    if (
      !Number.isInteger(input.byteLength) ||
      input.byteLength <= 0 ||
      input.byteLength > this.maxUploadBytes
    ) {
      throw new RequestValidationError("Image size is outside the allowed range");
    }

    const objectKey = [
      "tenants",
      safeSegment(input.tenantId),
      "users",
      safeSegment(input.userId),
      "plants",
      safeSegment(input.plantId),
      "media",
      input.uploadId + "." + extension
    ].join("/");

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.byteLength,
      Metadata: {
        "dpn-upload-id": input.uploadId,
        "dpn-media-kind": input.mediaKind
      }
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadTtlSeconds
    });
    const expiresAt = new Date(Date.now() + this.uploadTtlSeconds * 1000).toISOString();

    return {
      uploadId: input.uploadId,
      objectKey,
      uploadUrl,
      expiresAt,
      headers: { "Content-Type": input.contentType }
    };
  }

  async inspectObject(objectKey: string): Promise<MediaObjectMetadata | undefined> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: objectKey
      }));
      return {
        byteLength: response.ContentLength ?? 0,
        ...(response.ContentType ? { contentType: response.ContentType } : {}),
        ...(response.ETag ? { etag: response.ETag.replace(/^"|"$/g, "") } : {})
      };
    } catch (error) {
      if (isMissingObject(error)) return undefined;
      throw error;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    }));
  }
}

export class FixedObjectStore implements ObjectStore {
  private readonly objects = new Map<string, MediaObjectMetadata>();

  async createUploadGrant(input: UploadGrantInput): Promise<UploadGrant> {
    const extension = EXTENSIONS[input.contentType] ?? "jpg";
    const objectKey = [
      "test",
      safeSegment(input.tenantId),
      safeSegment(input.plantId),
      input.uploadId + "." + extension
    ].join("/");
    return {
      uploadId: input.uploadId,
      objectKey,
      uploadUrl: "https://upload.invalid/test",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      headers: { "Content-Type": input.contentType }
    };
  }

  seedObject(objectKey: string, metadata: MediaObjectMetadata): void {
    this.objects.set(objectKey, metadata);
  }

  async inspectObject(objectKey: string): Promise<MediaObjectMetadata | undefined> {
    return this.objects.get(objectKey);
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }
}
