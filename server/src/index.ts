import { DevelopmentAuthVerifier, JwksAuthVerifier } from "./auth.js";
import { loadConfig } from "./config.js";
import { createPlatformApp } from "./app.js";
import { S3ObjectStore } from "./objectStore.js";
import { PostgresPlatformRepository } from "./postgresRepository.js";
import { PostgresNotificationOutboxRepository } from "./notificationRepository.js";
import { ExpoPushProvider } from "./pushProvider.js";
import { PlantPulsePushWorker } from "./pushWorker.js";
import { PlantPulseObservability } from "./observability.js";

const config = loadConfig();
const observability = new PlantPulseObservability("0.12.0");
const repository = new PostgresPlatformRepository(config.databaseUrl);
const notificationRepository = new PostgresNotificationOutboxRepository(config.databaseUrl);
const authVerifier = config.auth.mode === "development"
  ? new DevelopmentAuthVerifier()
  : new JwksAuthVerifier({
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      jwksUrl: config.auth.jwksUrl,
      tenantClaim: config.auth.tenantClaim
    });
const objectStore = new S3ObjectStore({
  region: config.objectStore.region,
  bucket: config.objectStore.bucket,
  ...(config.objectStore.endpoint ? { endpoint: config.objectStore.endpoint } : {}),
  forcePathStyle: config.objectStore.forcePathStyle,
  uploadTtlSeconds: config.objectStore.uploadTtlSeconds,
  maxUploadBytes: config.objectStore.maxUploadBytes
});

const app = await createPlatformApp({
  repository,
  authVerifier,
  objectStore,
  notificationRepository,
  observability,
  metricsEnabled: config.observability.metricsEnabled,
  controlHealthEnabled: config.observability.controlHealthEnabled,
  logger: true
});

const pushWorker = config.notifications.enabled
  ? new PlantPulsePushWorker({
      repository: notificationRepository,
      provider: new ExpoPushProvider(),
      intervalMs: config.notifications.workerIntervalMs,
      batchSize: config.notifications.batchSize,
      receiptDelayMs: config.notifications.receiptDelayMs,
      logger: app.log,
      observer: observability
    })
  : undefined;

pushWorker?.start();

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down PlantPulse platform");
  pushWorker?.stop();
  await app.close();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({
    host: config.host,
    port: config.port
  });
} catch (error) {
  app.log.error(error, "PlantPulse platform failed to start");
  await app.close();
  process.exit(1);
}
