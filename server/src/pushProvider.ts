export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
}

export type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

export type ExpoPushReceipt =
  | { status: "ok" }
  | { status: "error"; message: string; details?: { error?: string } };

export interface PushProvider {
  send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
  getReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>>;
}

export interface ExpoPushProviderOptions {
  sendEndpoint?: string;
  receiptEndpoint?: string;
  fetcher?: typeof fetch;
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expo Push Service returned an invalid response");
  }
  return value as Record<string, unknown>;
}

function ticketFrom(value: unknown): ExpoPushTicket {
  const object = ensureObject(value);
  if (object.status === "ok" && typeof object.id === "string") {
    return { status: "ok", id: object.id };
  }
  if (object.status === "error" && typeof object.message === "string") {
    const details = ensureObject(object.details ?? {});
    return {
      status: "error",
      message: object.message,
      ...(typeof details.error === "string" ? { details: { error: details.error } } : {})
    };
  }
  throw new Error("Expo Push Service returned an invalid ticket");
}

function receiptFrom(value: unknown): ExpoPushReceipt {
  const object = ensureObject(value);
  if (object.status === "ok") return { status: "ok" };
  if (object.status === "error" && typeof object.message === "string") {
    const details = ensureObject(object.details ?? {});
    return {
      status: "error",
      message: object.message,
      ...(typeof details.error === "string" ? { details: { error: details.error } } : {})
    };
  }
  throw new Error("Expo Push Service returned an invalid receipt");
}

export class ExpoPushProvider implements PushProvider {
  private readonly sendEndpoint: string;
  private readonly receiptEndpoint: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ExpoPushProviderOptions = {}) {
    this.sendEndpoint = options.sendEndpoint ?? "https://exp.host/--/api/v2/push/send";
    this.receiptEndpoint = options.receiptEndpoint ?? "https://exp.host/--/api/v2/push/getReceipts";
    this.fetcher = options.fetcher ?? fetch;
  }

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (!messages.length) return [];
    if (messages.length > 100) throw new Error("Expo Push Service batch exceeds 100 messages");

    const response = await this.fetcher(this.sendEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(messages)
    });

    if (!response.ok) {
      throw new Error("Expo Push Service send failed with HTTP " + response.status);
    }

    const body = ensureObject(await response.json());
    const data = body.data;
    const values = Array.isArray(data) ? data : [data];
    if (values.length !== messages.length) {
      throw new Error("Expo Push Service ticket count did not match message count");
    }
    return values.map(ticketFrom);
  }

  async getReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (!ids.length) return {};
    const response = await this.fetcher(this.receiptEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ids })
    });

    if (!response.ok) {
      throw new Error("Expo Push Service receipt lookup failed with HTTP " + response.status);
    }

    const body = ensureObject(await response.json());
    const data = ensureObject(body.data ?? {});
    const output: Record<string, ExpoPushReceipt> = {};
    for (const [id, value] of Object.entries(data)) {
      output[id] = receiptFrom(value);
    }
    return output;
  }
}
