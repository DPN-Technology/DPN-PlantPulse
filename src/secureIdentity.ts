import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { DpnIdentitySession } from "./types";
import { isIdentitySessionUsable } from "./identity";

const SESSION_KEY = "dpn.plantpulse.identity.v1";

export async function persistSecureIdentitySession(session: DpnIdentitySession): Promise<void> {
  if (!session.accessToken && !session.refreshToken) {
    throw new Error("Cannot persist a DPN identity session without renewable credentials");
  }
  if (Platform.OS === "web") return;

  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify({
      provider: session.provider,
      profile: session.profile,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      tokenType: session.tokenType,
      scope: session.scope
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
      provider: parsed.provider,
      profile: parsed.profile,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
      tokenType: parsed.tokenType,
      scope: parsed.scope
    };
    if (isIdentitySessionUsable(session)) return session;
    if (session.provider === "oidc" && session.refreshToken) {
      return { ...session, status: "EXPIRED", accessToken: undefined };
    }
    await clearSecureIdentitySession();
    return undefined;
  } catch {
    return undefined;
  }
}

export async function clearSecureIdentitySession(): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
