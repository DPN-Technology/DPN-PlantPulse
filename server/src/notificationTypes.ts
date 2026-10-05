export type NotificationKind = "CARE" | "PREDICTION" | "SENSOR" | "SYNC" | "SECURITY";

export interface NotificationQueueItem {
  sourceId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  plantId?: string;
  createdAt?: string;
}

export interface QueueNotificationsInput {
  tenantId: string;
  userId: string;
  items: NotificationQueueItem[];
}

export interface NotificationDelivery {
  id: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  pushToken: string;
  kind: NotificationKind;
  sourceId: string;
  payload: Record<string, unknown>;
  attemptCount: number;
}

export interface NotificationReceiptCandidate {
  id: string;
  tenantId: string;
  deviceId: string;
  pushToken: string;
  pushTicketId: string;
  attemptCount: number;
}

export interface NotificationPreferences {
  care: boolean;
  prediction: boolean;
  sensor: boolean;
  sync: boolean;
  security: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  timeZone: string;
  updatedAt?: string;
}

export interface NotificationDeliveryStats {
  pending: number;
  retry: number;
  ticketed: number;
  delivered: number;
  dead: number;
  lastDeliveredAt?: string;
}

export interface NotificationOutboxRepository {
  ping(): Promise<void>;
  close(): Promise<void>;
  enqueueForUser(input: QueueNotificationsInput): Promise<number>;
  leasePending(limit: number): Promise<NotificationDelivery[]>;
  markTicketed(id: string, ticketId: string, nextCheckAt: Date): Promise<void>;
  markDelivered(id: string): Promise<void>;
  markRetry(id: string, error: string, nextAttemptAt: Date): Promise<void>;
  markDead(id: string, error: string): Promise<void>;
  leaseReceipts(limit: number): Promise<NotificationReceiptCandidate[]>;
  rescheduleReceipt(id: string, nextCheckAt: Date): Promise<void>;
  disablePushToken(tenantId: string, deviceId: string, pushToken: string): Promise<void>;
  getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences>;
  updatePreferences(tenantId: string, userId: string, preferences: NotificationPreferences): Promise<NotificationPreferences>;
  getDeliveryStats(tenantId: string, userId: string): Promise<NotificationDeliveryStats>;
}
