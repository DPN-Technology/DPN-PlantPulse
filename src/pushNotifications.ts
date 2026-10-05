import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { getPlatformRuntimeConfig } from "./platformConfig";

export interface PushRegistrationResult {
  pushToken?: string;
  status: "REGISTERED" | "DENIED" | "UNAVAILABLE" | "PROJECT_ID_MISSING";
  detail: string;
}

export async function registerPlantPulsePushNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") {
    return { status: "UNAVAILABLE", detail: "Native push registration is not enabled on web." };
  }

  if (!Device.isDevice) {
    return { status: "UNAVAILABLE", detail: "Remote push registration requires a supported device." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("plantpulse", {
      name: "DPN PlantPulse",
      importance: Notifications.AndroidImportance.HIGH
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") {
    return { status: "DENIED", detail: "Notification permission was not granted." };
  }

  const runtime = getPlatformRuntimeConfig();
  const projectId =
    runtime.expoProjectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    return {
      status: "PROJECT_ID_MISSING",
      detail: "EAS project ID is not configured, so an Expo push token cannot be requested."
    };
  }

  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return {
    status: "REGISTERED",
    pushToken,
    detail: "Push token registered for PlantPulse device enrollment."
  };
}
