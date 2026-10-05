import {
  Plant,
  SensorAlert,
  SensorDevice,
  SensorMetric,
  SensorNetworkSnapshot,
  SensorReading,
  SensorReadingQuality,
  SensorStatus
} from "./types";

const STALE_MINUTES = 30;
const OFFLINE_MINUTES = 180;

export interface GatewayTelemetryEnvelope {
  gatewayId: string;
  deviceId: string;
  deviceName?: string;
  firmwareVersion?: string;
  batteryPercent?: number;
  rssi?: number;
  observedAt: string;
  readings: Array<{
    metric: SensorMetric;
    value: number;
    unit: SensorReading["unit"];
  }>;
}

export interface BleSensorAdvertisement {
  deviceId: string;
  name?: string;
  rssi?: number;
  serviceUuids: string[];
}

export interface BleSensorAdapter {
  scan(): Promise<BleSensorAdvertisement[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  readTelemetry(deviceId: string): Promise<GatewayTelemetryEnvelope>;
}

export interface SensorGatewayClientOptions {
  baseUrl: string;
  authToken?: string;
  timeoutMs?: number;
}

export class HttpSensorGatewayClient {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly timeoutMs: number;

  constructor(options: SensorGatewayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  async pullPlantTelemetry(plantId: string): Promise<GatewayTelemetryEnvelope[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl + "/v1/plants/" + encodeURIComponent(plantId) + "/telemetry", {
        headers: this.authToken ? { Authorization: "Bearer " + this.authToken } : undefined,
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Sensor gateway returned HTTP " + response.status);
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) throw new Error("Sensor gateway returned invalid telemetry payload");
      return payload as GatewayTelemetryEnvelope[];
    } finally {
      clearTimeout(timer);
    }
  }
}

export function readingQuality(metric: SensorMetric, value: number): SensorReadingQuality {
  if (!Number.isFinite(value)) return "INVALID";
  const valid =
    metric === "soilMoisture" ? value >= 0 && value <= 100 :
    metric === "humidity" ? value >= 0 && value <= 100 :
    metric === "soilTemperature" || metric === "airTemperature" ? value >= -40 && value <= 85 :
    metric === "light" ? value >= 0 && value <= 200_000 :
    metric === "ec" ? value >= 0 && value <= 20 :
    metric === "ph" ? value >= 0 && value <= 14 :
    false;
  if (!valid) return "INVALID";

  const suspect =
    metric === "airTemperature" ? value < 0 || value > 50 :
    metric === "soilTemperature" ? value < 0 || value > 45 :
    metric === "light" ? value > 150_000 :
    metric === "ec" ? value > 10 :
    false;
  return suspect ? "SUSPECT" : "GOOD";
}

export function ingestGatewayEnvelope(plant: Plant, envelope: GatewayTelemetryEnvelope): Plant {
  const receivedAt = new Date().toISOString();
  const existing = plant.sensorDevices.find((device) => device.id === envelope.deviceId);
  const capabilities = Array.from(new Set(envelope.readings.map((reading) => reading.metric)));
  const device: SensorDevice = {
    id: envelope.deviceId,
    name: envelope.deviceName ?? existing?.name ?? envelope.deviceId,
    transport: "WIFI_GATEWAY",
    status: "ONLINE",
    capabilities,
    firmwareVersion: envelope.firmwareVersion ?? existing?.firmwareVersion,
    batteryPercent: envelope.batteryPercent ?? existing?.batteryPercent,
    rssi: envelope.rssi ?? existing?.rssi,
    gatewayId: envelope.gatewayId,
    lastSeenAt: envelope.observedAt
  };

  const readings: SensorReading[] = envelope.readings.map((reading, index) => ({
    id: envelope.deviceId + "-" + envelope.observedAt + "-" + reading.metric + "-" + index,
    sensorId: envelope.deviceId,
    metric: reading.metric,
    value: reading.value,
    unit: reading.unit,
    observedAt: envelope.observedAt,
    receivedAt,
    quality: readingQuality(reading.metric, reading.value),
    measured: true
  }));

  const alerts = detectSensorAlerts(readings, device);
  return {
    ...plant,
    sensorDevices: [
      device,
      ...plant.sensorDevices.filter((item) => item.id !== device.id)
    ],
    sensorReadings: [...readings, ...plant.sensorReadings].slice(0, 2000),
    sensorAlerts: [...alerts, ...plant.sensorAlerts].slice(0, 250)
  };
}

export function sensorStatus(device: SensorDevice, now = new Date()): SensorStatus {
  if (device.status === "PAIRING" || device.status === "ERROR") return device.status;
  if (!device.lastSeenAt) return "OFFLINE";
  const ageMinutes = (now.getTime() - new Date(device.lastSeenAt).getTime()) / 60_000;
  if (ageMinutes >= OFFLINE_MINUTES) return "OFFLINE";
  if (ageMinutes >= STALE_MINUTES) return "STALE";
  return "ONLINE";
}

export function buildSensorNetworkSnapshot(plant: Plant): SensorNetworkSnapshot {
  const latestReadings: SensorNetworkSnapshot["latestReadings"] = {};
  for (const reading of [...plant.sensorReadings].sort((a, b) =>
    new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
  )) {
    if (!latestReadings[reading.metric] && reading.quality !== "INVALID") {
      latestReadings[reading.metric] = reading;
    }
  }

  const statuses = plant.sensorDevices.map((device) => sensorStatus(device));
  return {
    online: statuses.filter((status) => status === "ONLINE").length,
    stale: statuses.filter((status) => status === "STALE").length,
    offline: statuses.filter((status) => status === "OFFLINE" || status === "ERROR").length,
    alertCount: plant.sensorAlerts.filter((alert) => !alert.acknowledgedAt).length,
    latestReadings
  };
}

export function detectSensorAlerts(readings: SensorReading[], device: SensorDevice): SensorAlert[] {
  const alerts: SensorAlert[] = [];
  const now = new Date().toISOString();

  if ((device.batteryPercent ?? 100) <= 15) {
    alerts.push({
      id: "sensor-alert-" + device.id + "-battery-" + Date.now(),
      sensorId: device.id,
      severity: "WARNING",
      title: "Sensor battery low",
      detail: device.name + " reports " + device.batteryPercent + "% battery.",
      createdAt: now
    });
  }

  for (const reading of readings) {
    if (reading.quality === "INVALID") {
      alerts.push({
        id: "sensor-alert-" + reading.id,
        sensorId: reading.sensorId,
        metric: reading.metric,
        severity: "WARNING",
        title: "Invalid sensor reading",
        detail: reading.metric + " reported an out-of-domain value and was excluded from trusted telemetry.",
        createdAt: now
      });
    } else if (reading.quality === "SUSPECT") {
      alerts.push({
        id: "sensor-alert-" + reading.id,
        sensorId: reading.sensorId,
        metric: reading.metric,
        severity: "WATCH",
        title: "Sensor reading needs review",
        detail: reading.metric + " is within the protocol domain but outside the typical operational range.",
        createdAt: now
      });
    }
  }

  return alerts;
}

export function acknowledgeSensorAlert(plant: Plant, alertId: string): Plant {
  const at = new Date().toISOString();
  return {
    ...plant,
    sensorAlerts: plant.sensorAlerts.map((alert) =>
      alert.id === alertId ? { ...alert, acknowledgedAt: at } : alert
    )
  };
}

export function latestMeasuredReading(plant: Plant, metric: SensorMetric): SensorReading | undefined {
  return [...plant.sensorReadings]
    .filter((reading) => reading.metric === metric && reading.quality === "GOOD")
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())[0];
}
