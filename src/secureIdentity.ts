import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DpnIdentitySession } from "./types";
import { isIdentitySessionUsable } from "./identity";

const SESSION_KEY = "dpn.plantpulse.identity.v1";

export async function persistSecureIdentitySession(session: DpnIdentitySession): Promise<void> {
  if (!isIdentitySessionUsable(session)) {
    throw new Error("Cannot persist an unusable DPN identity session");
  }
  if (Platform.OS === "web") return;

  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify({
      profile: session.profile,
      accessToken: session.accessToken,
      expiresAt: session.expiresAt
    }),
    {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK
    }
  );
}

export async function restoreSecureIdentitySession(): Promise<DpnIdentitySession | undefined> {
  if (Platform.OS === "web") return undefined;

  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<DpnIdentitySession>;
    const session: DpnIdentitySession = {
      status: "AUTHENTICATED",
      profile: parsed.profile,
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt
    };
    if (!isIdentitySessionUsable(session)) {
      await clearSecureIdentitySession();
      return undefined;
    }
    return session;
  } catch {
    return undefined;
  }
}

export async function clearSecureIdentitySession(): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
