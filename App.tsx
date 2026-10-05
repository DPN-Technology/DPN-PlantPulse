import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { BottomNav, Card, DpnHeader, MetricBar, Pill, ScoreBadge } from "./src/components";
import {
  ensurePlantPulseBackgroundSyncRegistered,
  triggerPlantPulseBackgroundSyncForTesting,
  unregisterPlantPulseBackgroundSync
} from "./src/backgroundSync";
import { careDueLabel, daysUntil } from "./src/care";
import { buildCareIntelligence } from "./src/careIntelligence";
import { seedPlants } from "./src/data";
import { scoreBand } from "./src/engine";
import {
  applyCareRecommendation,
  attachScanToPlant,
  completeCareAction,
  assignPlantTag,
  createPlantFromScan,
  recordRecommendationFeedback,
  updatePlantProfile
} from "./src/plantService";
import { buildLocalNotifications, mergeNotifications } from "./src/notificationEngine";
import { createPlantTag, parsePlantTagPayload } from "./src/plantTags";
import { defaultPlatformState, loadPlatformState, savePlatformState } from "./src/platformStorage";
import {
  prepareDpnOidcClient,
  PreparedDpnOidcClient,
  signInWithDpnOidc
} from "./src/oidcIdentity";
import {
  connectDevelopmentPlatform,
  disconnectPlatform,
  installIdentitySession,
  registerPushAndDevice,
  refreshPlatformControlPlane,
  revokeTrustedPlatformDevice,
  savePlatformNotificationPreferences,
  resolvePlatformConflict,
  restorePlatformRuntime,
  shouldAutoRetryPlatformSync,
  synchronizePlatformRuntime
} from "./src/platformRuntime";
import { plantIntelligenceClient } from "./src/services/plantIntelligence";
import { getSpeciesCareBaseline } from "./src/speciesCare";
import {
  acknowledgeSensorAlert,
  buildSensorNetworkSnapshot,
  sensorStatus
} from "./src/sensors";
import { loadPlants, savePlants } from "./src/storage";
import { colors, radius } from "./src/theme";
import {
  CareAction,
  CareRecommendation,
  NotificationPreferences,
  Plant,
  PlantProfileUpdate,
  PlatformState,
  RecommendationFeedbackValue,
  SensorMetric,
  SensorReading,
  ScanMode,
  ScanResult,
  Screen,
  SyncConflict
} from "./src/types";

const modes: Array<{ key: ScanMode; label: string }> = [
  { key: "identify", label: "IDENTIFY" },
  { key: "health", label: "HEALTH" },
  { key: "disease", label: "DISEASE" },
  { key: "leaf", label: "LEAF" },
  { key: "pest", label: "PEST" },
  { key: "soil", label: "SOIL" },
  { key: "growth", label: "GROWTH" }
];

function defaultNotificationPreferences(): NotificationPreferences {
  let timeZone = "UTC";
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // UTC remains the safe fallback.
  }
  return {
    care: true,
    prediction: true,
    sensor: true,
    sync: true,
    security: true,
    quietHoursEnabled: false,
    quietStart: "22:00",
    quietEnd: "07:00",
    timeZone
  };
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.disabled]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [plants, setPlants] = useState<Plant[]>(seedPlants);
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>("health");
  const [scanTargetPlantId, setScanTargetPlantId] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [platformLoaded, setPlatformLoaded] = useState(false);
  const [platformState, setPlatformState] = useState<PlatformState>(defaultPlatformState);
  const [platformSyncing, setPlatformSyncing] = useState(false);
  const [oidcClient, setOidcClient] = useState<PreparedDpnOidcClient | null>(null);
  const [oidcPreparing, setOidcPreparing] = useState(false);
  const [oidcError, setOidcError] = useState<string | null>(null);

  useEffect(() => {
    loadPlants(seedPlants).then((stored) => {
      setPlants(stored);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    savePlants(plants).catch(() => undefined);
  }, [plants, loaded]);

  useEffect(() => {
    setOidcPreparing(true);
    prepareDpnOidcClient()
      .then((prepared) => {
        setOidcClient(prepared);
        setOidcError(null);
      })
      .catch((error) => {
        setOidcClient(null);
        setOidcError(error instanceof Error ? error.message : "DPN Identity OIDC is unavailable.");
      })
      .finally(() => setOidcPreparing(false));
  }, []);

  useEffect(() => {
    loadPlatformState()
      .then((stored) => restorePlatformRuntime(stored))
      .then(async (restored) => {
        if (restored.identity.status === "AUTHENTICATED" && restored.platformBaseUrl) {
          try {
            return await refreshPlatformControlPlane(restored);
          } catch {
            return restored;
          }
        }
        return restored;
      })
      .then((restored) => {
        setPlatformState(restored);
        setPlatformLoaded(true);
      })
      .catch(() => setPlatformLoaded(true));
  }, []);

  useEffect(() => {
    if (!platformLoaded) return;
    savePlatformState(platformState).catch(() => undefined);
  }, [platformState, platformLoaded]);

  useEffect(() => {
    if (!platformLoaded) return;
    if (!platformState.platformBaseUrl || platformState.identity.status === "DISCONNECTED") return;

    ensurePlantPulseBackgroundSyncRegistered(platformState.backgroundSync)
      .then((backgroundSync) => {
        setPlatformState((current) => ({ ...current, backgroundSync }));
      })
      .catch((error) => {
        setPlatformState((current) => ({
          ...current,
          backgroundSync: {
            availability: "RESTRICTED",
            registered: false,
            lastError: error instanceof Error ? error.message : "Background sync registration failed."
          }
        }));
      });
  }, [platformLoaded, platformState.platformBaseUrl, platformState.identity.status]);

  useEffect(() => {
    if (!platformLoaded) return;
    const generated = buildLocalNotifications(plants);
    setPlatformState((current) => ({
      ...current,
      notifications: mergeNotifications(current.notifications, generated)
    }));
  }, [plants, platformLoaded]);

  const selectedPlant = plants.find((plant) => plant.id === selectedPlantId) ?? null;

  const openPlant = (id: string) => {
    setSelectedPlantId(id);
    setScreen("plant");
  };

  const navigate = (next: Screen) => {
    if (next !== "result") setScanResult(null);
    setScreen(next);
  };

  const runAnalysis = async (uri: string) => {
    const targetPlant = plants.find((plant) => plant.id === scanTargetPlantId);
    const previousScan = targetPlant?.scanHistory[0];

    if (scanMode === "growth" && !targetPlant) {
      Alert.alert("Select a saved plant", "Growth comparison needs an existing plant with historical context.");
      return;
    }

    setAnalyzing(true);
    try {
      const result = await plantIntelligenceClient.analyze({
        imageUri: uri,
        mode: scanMode,
        plantId: targetPlant?.id,
        previousScan
      });
      setScanResult(result);
      setScreen("result");
    } catch {
      Alert.alert("Analysis error", "PlantPulse could not complete this scan.");
    } finally {
      setAnalyzing(false);
    }
  };

  const updatePlantRecord = (id: string, updater: (plant: Plant) => Plant) => {
    setPlants((current) => current.map((plant) => (plant.id === id ? updater(plant) : plant)));
  };

  const saveScanAsPlant = () => {
    if (!scanResult) return;
    const plant = createPlantFromScan(scanResult);
    setPlants((current) => [plant, ...current]);
    setSelectedPlantId(plant.id);
    setCapturedUri(null);
    setScreen("plant");
  };

  const applyScanToExisting = (plantId: string) => {
    if (!scanResult) return;
    updatePlantRecord(plantId, (plant) => attachScanToPlant(plant, scanResult));
    setSelectedPlantId(plantId);
    setCapturedUri(null);
    setScreen("plant");
  };

  const recordCare = (plantId: string, action: CareAction) => {
    updatePlantRecord(plantId, (plant) => completeCareAction(plant, action));
  };

  const savePlantProfile = (plantId: string, update: PlantProfileUpdate) => {
    updatePlantRecord(plantId, (plant) => updatePlantProfile(plant, update));
  };

  const feedbackRecommendation = (
    plantId: string,
    recommendationId: string,
    value: RecommendationFeedbackValue
  ) => {
    updatePlantRecord(
      plantId,
      (plant) => recordRecommendationFeedback(plant, recommendationId, value)
    );
  };

  const applyRecommendation = (plantId: string, recommendation: CareRecommendation) => {
    updatePlantRecord(plantId, (plant) => applyCareRecommendation(plant, recommendation));
  };

  const acknowledgeAlert = (plantId: string, alertId: string) => {
    updatePlantRecord(plantId, (plant) => acknowledgeSensorAlert(plant, alertId));
  };

  const generatePlantTag = (plantId: string) => {
    updatePlantRecord(plantId, (plant) => assignPlantTag(plant, createPlantTag(plant.id)));
  };

  const markNotificationRead = (notificationId: string) => {
    const at = new Date().toISOString();
    setPlatformState((current) => ({
      ...current,
      notifications: current.notifications.map((item) =>
        item.id === notificationId ? { ...item, readAt: at } : item
      )
    }));
  };

  const runPlatformSync = async (showResult = true) => {
    if (platformSyncing) return;
    setPlatformSyncing(true);
    try {
      const result = await synchronizePlatformRuntime(plants, platformState);
      setPlants(result.plants);
      setPlatformState(result.state);

      if (showResult) {
        const summary = result.state.lastSyncSummary;
        if (result.state.lastSyncError && !summary) {
          Alert.alert("DPN Platform sync failed", result.state.lastSyncError);
        } else if (summary) {
          Alert.alert(
            summary.failed > 0 || summary.conflicts > 0 ? "DPN Platform sync needs attention" : "DPN Platform synchronized",
            "Pushed " + summary.pushed +
              " • Pulled " + summary.pulled +
              " • Images " + summary.uploadedImages +
              " • Conflicts " + summary.conflicts +
              " • Push " + summary.queuedNotifications +
              (summary.failed > 0 ? " • Retry " + summary.failed : "")
          );
        }
      }
    } finally {
      setPlatformSyncing(false);
    }
  };

  const signInOidcRuntime = async () => {
    if (!oidcClient) {
      Alert.alert("DPN Identity unavailable", oidcError ?? "OIDC client is not ready.");
      return;
    }

    try {
      const identity = await signInWithDpnOidc(oidcClient);
      const next = await installIdentitySession(platformState, identity);
      setPlatformState(next);
      Alert.alert("DPN Identity connected", "Authorization Code + PKCE sign-in completed.");
    } catch (error) {
      Alert.alert("DPN Identity sign-in failed", error instanceof Error ? error.message : "OIDC sign-in did not complete.");
    }
  };

  const connectDevelopmentRuntime = async (baseUrl: string, tenantId: string, userId: string) => {
    try {
      const next = await connectDevelopmentPlatform(platformState, baseUrl, tenantId, userId);
      setPlatformState(next);
      Alert.alert("DPN Platform connected", "Development identity is stored in native SecureStore for this device.");
    } catch (error) {
      Alert.alert("Connection failed", error instanceof Error ? error.message : "Could not connect to DPN Platform.");
    }
  };

  const disconnectPlatformRuntime = async () => {
    const backgroundSync = await unregisterPlantPulseBackgroundSync(platformState.backgroundSync);
    const next = await disconnectPlatform(platformState);
    setPlatformState({ ...next, backgroundSync });
  };

  const testBackgroundSyncRuntime = async () => {
    const triggered = await triggerPlantPulseBackgroundSyncForTesting();
    if (!triggered) {
      Alert.alert("Background sync test unavailable", "This test trigger only works in a compatible development build.");
      return;
    }
    const stored = await loadPlatformState();
    setPlatformState(await restorePlatformRuntime(stored));
    Alert.alert("Background sync test complete", "The native background worker was triggered through the development-only test hook.");
  };

  const registerPushRuntime = async () => {
    try {
      const result = await registerPushAndDevice(platformState);
      setPlatformState(result.state);
      Alert.alert(
        result.push.status === "REGISTERED" ? "Push enrollment ready" : "Push enrollment",
        result.push.detail
      );
    } catch (error) {
      Alert.alert("Push enrollment failed", error instanceof Error ? error.message : "Could not enroll this device.");
    }
  };

  const saveNotificationPreferencesRuntime = async (preferences: NotificationPreferences) => {
    try {
      const next = await savePlatformNotificationPreferences(platformState, preferences);
      setPlatformState(next);
      Alert.alert("Notification policy saved", "PlantPulse delivery policy is now enforced server-side.");
    } catch (error) {
      Alert.alert("Preference update failed", error instanceof Error ? error.message : "Could not update notification policy.");
    }
  };

  const refreshControlPlaneRuntime = async () => {
    try {
      setPlatformState(await refreshPlatformControlPlane(platformState));
    } catch (error) {
      Alert.alert("Operational refresh failed", error instanceof Error ? error.message : "Could not refresh platform operations.");
    }
  };

  const revokeTrustedDeviceRuntime = async (deviceId: string) => {
    if (deviceId === platformState.device?.deviceId) {
      Alert.alert("Current device", "Use DISCONNECT DPN IDENTITY to remove this device session locally.");
      return;
    }
    try {
      setPlatformState(await revokeTrustedPlatformDevice(platformState, deviceId));
    } catch (error) {
      Alert.alert("Device revocation failed", error instanceof Error ? error.message : "Could not revoke device trust.");
    }
  };

  const resolveConflictRuntime = (conflict: SyncConflict, strategy: "KEEP_LOCAL" | "USE_REMOTE") => {
    try {
      const result = resolvePlatformConflict(plants, platformState, conflict, strategy);
      setPlants(result.plants);
      setPlatformState(result.state);
    } catch (error) {
      Alert.alert("Conflict resolution failed", error instanceof Error ? error.message : "Could not resolve conflict.");
    }
  };

  useEffect(() => {
    if (!loaded || !platformLoaded || platformSyncing) return;

    const attempt = () => {
      if (shouldAutoRetryPlatformSync(plants, platformState)) {
        void runPlatformSync(false);
      }
    };

    attempt();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") attempt();
    });
    return () => subscription.remove();
  }, [
    loaded,
    platformLoaded,
    platformSyncing,
    plants,
    platformState.identity.status,
    platformState.platformBaseUrl,
    platformState.nextRetryAt
  ]);

  const averageScore = Math.round(plants.reduce((sum, plant) => sum + plant.healthScore, 0) / Math.max(1, plants.length));
  const attention = plants.filter((plant) => plant.healthScore < 75);
  const dueCare = plants.filter((plant) => daysUntil(plant.nextWaterAt) <= 1 || daysUntil(plant.nextFeedAt) <= 1);

  const renderScreen = () => {
    if (screen === "scan") {
      return (
        <ScanScreen
          mode={scanMode}
          onMode={setScanMode}
          plants={plants}
          targetPlantId={scanTargetPlantId}
          onTargetPlant={setScanTargetPlantId}
          capturedUri={capturedUri}
          onCaptured={setCapturedUri}
          analyzing={analyzing}
          onAnalyze={runAnalysis}
        />
      );
    }

    if (screen === "result" && scanResult) {
      return (
        <ResultScreen
          result={scanResult}
          plants={plants}
          targetPlantId={scanTargetPlantId}
          onSave={saveScanAsPlant}
          onApplyToPlant={applyScanToExisting}
          onRescan={() => setScreen("scan")}
        />
      );
    }

    if (screen === "collection") {
      return <CollectionScreen plants={plants} onOpen={openPlant} />;
    }

    if (screen === "plant" && selectedPlant) {
      return (
        <PlantScreen
          plant={selectedPlant}
          onBack={() => setScreen("collection")}
          onCare={recordCare}
          onUpdate={savePlantProfile}
          onRecommendationFeedback={feedbackRecommendation}
          onApplyRecommendation={applyRecommendation}
          onAcknowledgeSensorAlert={acknowledgeAlert}
          onGeneratePlantTag={generatePlantTag}
        />
      );
    }

    if (screen === "care") {
      return (
        <CareScreen
          plants={plants}
          onCare={recordCare}
          onRecommendationFeedback={feedbackRecommendation}
          onApplyRecommendation={applyRecommendation}
        />
      );
    }

    if (screen === "sensors") {
      return <SensorNetworkScreen plants={plants} onAcknowledge={acknowledgeAlert} />;
    }

    if (screen === "platform") {
      return (
        <PlatformScreen
          plants={plants}
          platformState={platformState}
          syncing={platformSyncing}
          onOpenPlant={openPlant}
          onReadNotification={markNotificationRead}
          onSync={() => void runPlatformSync(true)}
          onConnectDevelopment={(baseUrl, tenantId, userId) => void connectDevelopmentRuntime(baseUrl, tenantId, userId)}
          oidcIssuer={oidcClient?.issuer}
          oidcReady={Boolean(oidcClient)}
          oidcPreparing={oidcPreparing}
          oidcError={oidcError}
          onOidcSignIn={() => void signInOidcRuntime()}
          onDisconnect={() => void disconnectPlatformRuntime()}
          onRegisterPush={() => void registerPushRuntime()}
          onTestBackgroundSync={() => void testBackgroundSyncRuntime()}
          onSaveNotificationPreferences={(preferences) => void saveNotificationPreferencesRuntime(preferences)}
          onRefreshControlPlane={() => void refreshControlPlaneRuntime()}
          onRevokeDevice={(deviceId) => void revokeTrustedDeviceRuntime(deviceId)}
          onResolveConflict={resolveConflictRuntime}
        />
      );
    }

    if (screen === "ai") {
      return <AiScreen plants={plants} />;
    }

    return (
      <HomeScreen
        plants={plants}
        averageScore={averageScore}
        attention={attention}
        dueCare={dueCare}
        onScan={() => setScreen("scan")}
        onOpen={openPlant}
        onViewPlants={() => setScreen("collection")}
        onPlatform={() => setScreen("platform")}
      />
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.binaryTop}>
        <Text style={styles.binaryText}>01000100 01010000 01001110 // BIOLOGICAL INTELLIGENCE NETWORK</Text>
      </View>
      <View style={styles.body}>{renderScreen()}</View>
      {screen !== "result" ? <BottomNav screen={screen} onChange={navigate} /> : null}
    </View>
  );
}

function HomeScreen({
  plants,
  averageScore,
  attention,
  dueCare,
  onScan,
  onOpen,
  onViewPlants,
  onPlatform
}: {
  plants: Plant[];
  averageScore: number;
  attention: Plant[];
  dueCare: Plant[];
  onScan: () => void;
  onOpen: (id: string) => void;
  onViewPlants: () => void;
  onPlatform: () => void;
}) {
  const predictiveWatch = plants
    .map((plant) => ({ plant, intelligence: buildCareIntelligence(plant) }))
    .filter(({ intelligence }) => intelligence.prediction.risk === "ELEVATED" || intelligence.prediction.risk === "HIGH")
    .sort((a, b) => b.intelligence.prediction.confidence - a.intelligence.prediction.confidence);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <DpnHeader
        eyebrow="DPN PLANTPULSE // ADAPTIVE INTELLIGENCE"
        title="Plant Intelligence"
        subtitle="Identify. Diagnose. Track. Predict. Build a living health record for every plant."
      />

      <Pressable onPress={onScan}>
        <Card style={styles.heroCard}>
          <View style={styles.heroGrid}>
            <View style={styles.heroCopy}>
              <Pill label="PLANT INTELLIGENCE SCAN" />
              <Text style={styles.heroTitle}>SCAN A PLANT</Text>
              <Text style={styles.heroText}>Launch the camera and generate a PlantPulse health profile.</Text>
              <View style={styles.inlineCta}>
                <Text style={styles.inlineCtaText}>OPEN SCANNER</Text>
                <Text style={styles.inlineCtaArrow}>→</Text>
              </View>
            </View>
            <View style={styles.scannerOrb}>
              <Text style={styles.scannerOrbIcon}>◎</Text>
              <Text style={styles.scannerOrbLabel}>READY</Text>
            </View>
          </View>
        </Card>
      </Pressable>

      <SectionTitle title="PLANT NETWORK" action={plants.length + " REGISTERED"} />
      <View style={styles.statGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>NETWORK HEALTH</Text>
          <Text style={styles.statValue}>{averageScore}</Text>
          <Text style={styles.statMeta}>{scoreBand(averageScore)}</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>NEEDS ATTENTION</Text>
          <Text style={[styles.statValue, attention.length > 0 && { color: colors.amber }]}>{attention.length}</Text>
          <Text style={styles.statMeta}>PLANTS</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>PREDICTIVE WATCH</Text>
          <Text style={[styles.statValue, predictiveWatch.length > 0 && { color: colors.amber }]}>{predictiveWatch.length}</Text>
          <Text style={styles.statMeta}>{dueCare.length} CARE DUE</Text>
        </Card>
      </View>

      {predictiveWatch.length > 0 ? (
        <>
          <SectionTitle title="PREDICTION WATCHLIST" action="7-DAY MODEL" />
          {predictiveWatch.slice(0, 3).map(({ plant, intelligence }) => (
            <Pressable key={plant.id} onPress={() => onOpen(plant.id)}>
              <Card style={styles.predictiveRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plantName}>{plant.nickname}</Text>
                  <Text style={styles.plantLatin}>
                    {intelligence.trend.direction} • projected {intelligence.prediction.projectedScore}/100
                  </Text>
                </View>
                <View style={styles.predictionRiskBox}>
                  <Text style={styles.predictionRisk}>{intelligence.prediction.risk}</Text>
                  <Text style={styles.predictionConfidence}>{intelligence.prediction.confidence}% CONF</Text>
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>PRIORITY PLANTS</Text>
        <Pressable onPress={onViewPlants}><Text style={styles.sectionAction}>VIEW ALL</Text></Pressable>
      </View>

      {plants.slice(0, 3).map((plant) => (
        <Pressable key={plant.id} onPress={() => onOpen(plant.id)}>
          <Card style={styles.plantRow}>
            <View style={styles.plantGlyph}><Text style={styles.plantGlyphText}>♧</Text></View>
            <View style={styles.plantRowCopy}>
              <Text style={styles.plantName}>{plant.nickname}</Text>
              <Text style={styles.plantLatin}>{plant.scientificName} • {plant.location}</Text>
            </View>
            <View style={styles.miniScore}>
              <Text style={styles.miniScoreValue}>{plant.healthScore}</Text>
              <Text style={styles.miniScoreLabel}>PULSE</Text>
            </View>
          </Card>
        </Pressable>
      ))}

      <Pressable onPress={onPlatform}>
        <Card style={styles.platformHeroCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>DPN PLATFORM // OFFLINE-FIRST</Text>
            <Text style={styles.infoBody}>Identity, revisioned cloud sync, conflict protection, PlantPulse tags, notifications, and multi-device infrastructure.</Text>
          </View>
          <Text style={styles.platformHeroArrow}>→</Text>
        </Card>
      </Pressable>

      <SectionTitle title="DPN INTELLIGENCE MODULES" />
      <View style={styles.moduleGrid}>
        {[
          ["VISION", "Species + symptom analysis"],
          ["CARE", "Adaptive recommendation engine"],
          ["PREDICT", "7-day health trend forecasting"],
          ["SENSORS", "Measured environmental telemetry"]
        ].map(([name, description]) => (
          <Card key={name} style={styles.moduleCard}>
            <Text style={styles.moduleName}>{name}</Text>
            <Text style={styles.moduleDescription}>{description}</Text>
          </Card>
        ))}
      </View>

      <Text style={styles.prototypeNote}>v0.6 remains offline-first. Cloud identity, storage, and synchronization are real client contracts, but no production DPN Platform endpoint is falsely represented as deployed.</Text>
    </ScrollView>
  );
}

function ScanScreen({
  mode,
  onMode,
  plants,
  targetPlantId,
  onTargetPlant,
  capturedUri,
  onCaptured,
  analyzing,
  onAnalyze
}: {
  mode: ScanMode;
  onMode: (mode: ScanMode) => void;
  plants: Plant[];
  targetPlantId: string | null;
  onTargetPlant: (plantId: string | null) => void;
  capturedUri: string | null;
  onCaptured: (uri: string | null) => void;
  analyzing: boolean;
  onAnalyze: (uri: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [torch, setTorch] = useState(false);
  const targetPlant = plants.find((plant) => plant.id === targetPlantId) ?? null;
  const growthNeedsTarget = mode === "growth" && !targetPlant;

  const capture = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.72 });
      if (photo?.uri) onCaptured(photo.uri);
    } catch {
      Alert.alert("Camera error", "PlantPulse could not capture the image.");
    }
  };

  const importPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission required", "Photo access is required to import a plant image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8
    });
    if (!result.canceled && result.assets[0]?.uri) {
      onCaptured(result.assets[0].uri);
    }
  };

  return (
    <View style={styles.scanScreen}>
      <View style={styles.scanHeader}>
        <View>
          <Text style={styles.eyebrow}>PLANTPULSE VISION // V0.3</Text>
          <Text style={styles.scanTitle}>Plant Intelligence Scan</Text>
        </View>
        <Pill label={mode.toUpperCase()} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeStrip}>
        {modes.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => onMode(item.key)}
            style={[styles.modeChip, mode === item.key && styles.modeChipActive]}
          >
            <Text style={[styles.modeChipText, mode === item.key && styles.modeChipTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View>
        <Text style={styles.contextLabel}>SCAN CONTEXT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextStrip}>
          <Pressable
            onPress={() => onTargetPlant(null)}
            style={[styles.contextChip, !targetPlantId && styles.contextChipActive]}
          >
            <Text style={[styles.contextChipTitle, !targetPlantId && styles.contextChipTitleActive]}>NEW / UNLINKED</Text>
            <Text style={styles.contextChipMeta}>No history</Text>
          </Pressable>
          {plants.map((plant) => (
            <Pressable
              key={plant.id}
              onPress={() => onTargetPlant(plant.id)}
              style={[styles.contextChip, targetPlantId === plant.id && styles.contextChipActive]}
            >
              <Text style={[styles.contextChipTitle, targetPlantId === plant.id && styles.contextChipTitleActive]}>{plant.nickname}</Text>
              <Text style={styles.contextChipMeta}>{plant.scanHistory.length} scans • Pulse {plant.healthScore}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {growthNeedsTarget ? (
          <Text style={styles.contextWarning}>Growth mode requires a saved plant so PlantPulse can compare against historical data.</Text>
        ) : targetPlant ? (
          <Text style={styles.contextReady}>Context loaded: {targetPlant.nickname} • previous scans {targetPlant.scanHistory.length}</Text>
        ) : null}
      </View>

      <View style={styles.cameraShell}>
        {capturedUri ? (
          <Image source={{ uri: capturedUri }} style={styles.camera} resizeMode="cover" />
        ) : !permission ? (
          <View style={styles.cameraFallback}><ActivityIndicator color={colors.green} /></View>
        ) : !permission.granted ? (
          <View style={styles.cameraFallback}>
            <Text style={styles.cameraFallbackTitle}>CAMERA ACCESS REQUIRED</Text>
            <Text style={styles.cameraFallbackText}>PlantPulse uses the camera only when you launch a plant scan.</Text>
            <PrimaryButton label="GRANT CAMERA ACCESS" onPress={requestPermission} />
          </View>
        ) : (
          <CameraView ref={cameraRef} style={styles.camera} facing="back" enableTorch={torch} />
        )}

        <View pointerEvents="none" style={styles.reticle}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <View style={styles.scanLine} />
          <Text style={styles.reticleLabel}>ALIGN SUBJECT // CAPTURE DETAIL + WHOLE PLANT</Text>
        </View>
      </View>

      {analyzing ? (
        <Card style={styles.analysisCard}>
          <ActivityIndicator color={colors.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.analysisTitle}>VISION PIPELINE ACTIVE</Text>
            <Text style={styles.analysisText}>Identity • confidence • evidence • findings • historical comparison</Text>
          </View>
        </Card>
      ) : (
        <View style={styles.scanControls}>
          {capturedUri ? (
            <>
              <SecondaryButton label="RETAKE" onPress={() => onCaptured(null)} />
              <PrimaryButton label="ANALYZE PLANT" disabled={growthNeedsTarget} onPress={() => onAnalyze(capturedUri)} />
            </>
          ) : (
            <>
              <SecondaryButton label="IMPORT PHOTO" onPress={importPhoto} />
              <Pressable onPress={capture} style={styles.shutterOuter}>
                <View style={styles.shutterInner} />
              </Pressable>
              <SecondaryButton label={torch ? "TORCH ON" : "TORCH"} onPress={() => setTorch((value) => !value)} />
            </>
          )}
        </View>
      )}

      <Text style={styles.prototypeNote}>The current local engine exercises the full v0.3 confidence/evidence workflow but does not perform production botanical computer vision. Production inference is connected through the DPN Vision API adapter.</Text>
    </View>
  );
}

function ResultScreen({
  result,
  plants,
  targetPlantId,
  onSave,
  onApplyToPlant,
  onRescan
}: {
  result: ScanResult;
  plants: Plant[];
  targetPlantId: string | null;
  onSave: () => void;
  onApplyToPlant: (plantId: string) => void;
  onRescan: () => void;
}) {
  const targetPlant = plants.find((plant) => plant.id === targetPlantId) ?? null;
  const statusTone =
    result.identificationStatus === "CONFIDENT"
      ? "green"
      : result.identificationStatus === "REVIEW"
        ? "amber"
        : "red";

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.resultTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DPN PLANTPULSE // VISION ANALYSIS</Text>
          <Text style={styles.resultName}>{result.commonName}</Text>
          <Text style={styles.plantLatin}>{result.scientificName}</Text>
          <View style={styles.tagRow}>
            <Pill label={result.identificationStatus} tone={statusTone} />
            <Pill label={result.confidenceBand + " CONFIDENCE"} tone={statusTone} />
            <Pill label={result.engine === "local-prototype" ? "LOCAL PROTOTYPE" : "DPN VISION API"} tone={result.prototype ? "amber" : "green"} />
          </View>
        </View>
      </View>

      <Image source={{ uri: result.imageUri }} style={styles.resultImage} />

      <Card style={styles.scorePanel}>
        <ScoreBadge score={result.healthScore} band={result.band} />
        <View style={styles.scoreCopy}>
          <Text style={styles.scoreHeadline}>PLANTPULSE SCORE</Text>
          <Text style={styles.scoreBody}>Identification confidence: {result.identificationConfidence}%</Text>
          <Text style={styles.scoreBody}>Capture quality: {result.captureQuality.score}%</Text>
          <Text style={styles.scoreBody}>Engine: {result.modelVersion}</Text>
        </View>
      </Card>

      {result.identificationStatus !== "CONFIDENT" ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningTitle}>
            {result.identificationStatus === "UNKNOWN" ? "IDENTIFICATION UNKNOWN" : "IDENTIFICATION NEEDS REVIEW"}
          </Text>
          <Text style={styles.warningText}>Do not rely on species-specific toxicity, ingestion, pesticide, or treatment guidance until identification is confirmed.</Text>
        </Card>
      ) : null}

      <SectionTitle title="SPECIES CANDIDATES" action="RANKED" />
      <Card>
        {result.speciesCandidates.map((candidate, index) => (
          <View key={candidate.scientificName + String(index)} style={styles.candidateRow}>
            <Text style={styles.candidateRank}>{String(index + 1).padStart(2, "0")}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.plantName}>{candidate.commonName}</Text>
              <Text style={styles.plantLatin}>{candidate.scientificName}</Text>
            </View>
            <Text style={styles.candidateConfidence}>{candidate.confidence}%</Text>
          </View>
        ))}
      </Card>

      <SectionTitle title="CAPTURE QUALITY" action={result.captureQuality.score + "%"} />
      <Card style={result.captureQuality.score < 70 ? styles.warningCard : undefined}>
        {result.captureQuality.issues.length > 0 ? result.captureQuality.issues.map((issue) => (
          <Text key={issue} style={styles.warningText}>• {issue}</Text>
        )) : <Text style={styles.infoBody}>Capture cleared the current quality threshold.</Text>}
        {result.captureQuality.guidance.map((guide) => (
          <Text key={guide} style={styles.captureGuide}>→ {guide}</Text>
        ))}
      </Card>

      <SectionTitle title="HEALTH TELEMETRY" />
      <Card style={styles.metricCard}>
        <MetricBar label="Leaf health" value={result.breakdown.leaf} />
        <MetricBar label="Hydration" value={result.breakdown.hydration} />
        <MetricBar label="Light compatibility" value={result.breakdown.light} />
        <MetricBar label="Nutrition" value={result.breakdown.nutrition} />
        <MetricBar label="Disease risk" value={result.breakdown.diseaseRisk} inverse />
        <MetricBar label="Pest risk" value={result.breakdown.pestRisk} inverse />
      </Card>

      <SectionTitle title="RANKED FINDINGS" action={result.findings.length + " CANDIDATES"} />
      {result.findings.map((finding) => (
        <Card key={finding.id} style={styles.findingCard}>
          <View style={styles.findingTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.findingCategory}>{finding.category.toUpperCase()} // {finding.severity.toUpperCase()}</Text>
              <Text style={styles.findingTitle}>{finding.title}</Text>
            </View>
            <Text style={styles.findingConfidence}>{finding.confidence}%</Text>
          </View>
          <Text style={styles.findingSummary}>{finding.summary}</Text>
          <Text style={styles.findingEvidenceLink}>Evidence: {finding.evidenceIds.join(" • ") || "none"}</Text>
        </Card>
      ))}

      <SectionTitle title="EXPLAINABLE EVIDENCE" />
      <Card>
        {result.evidence.map((item) => (
          <View key={item.id} style={styles.evidenceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineLabel}>{item.label}</Text>
              <Text style={styles.timelineDate}>{item.kind.toUpperCase()} • {item.detail}</Text>
            </View>
            <Text style={styles.evidenceConfidence}>{item.confidence}%</Text>
          </View>
        ))}
      </Card>

      {result.growthComparison ? (
        <>
          <SectionTitle title="HISTORICAL COMPARISON" />
          <Card style={styles.growthCard}>
            <Text style={styles.growthTitle}>
              {result.growthComparison.available
                ? (result.growthComparison.scoreDelta ?? 0) >= 0
                  ? "+" + (result.growthComparison.scoreDelta ?? 0) + " PULSE"
                  : String(result.growthComparison.scoreDelta ?? 0) + " PULSE"
                : "BASELINE NEEDED"}
            </Text>
            <Text style={styles.infoBody}>{result.growthComparison.interpretation}</Text>
            {result.growthComparison.available ? (
              <Text style={styles.timelineDate}>Previous {result.growthComparison.previousScore} • {result.growthComparison.elapsedDays} days elapsed</Text>
            ) : null}
          </Card>
        </>
      ) : null}

      <SectionTitle title="OBSERVATIONS" />
      <Card>
        {result.observations.map((item, index) => (
          <View key={item} style={styles.bulletRow}>
            <Text style={styles.bulletIndex}>{String(index + 1).padStart(2, "0")}</Text>
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))}
      </Card>

      <SectionTitle title="ACTION PLAN" />
      <Card>
        {result.actions.map((item) => (
          <View key={item} style={styles.actionRow}>
            <Text style={styles.actionCheck}>✓</Text>
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))}
      </Card>

      <SectionTitle title="SAFETY / TOXICITY" />
      <Card style={styles.warningCard}>
        <Text style={styles.warningTitle}>VERIFY BEFORE SAFETY DECISIONS</Text>
        <Text style={styles.warningText}>{result.toxicity}</Text>
      </Card>

      <View style={styles.buttonStack}>
        {targetPlant ? <PrimaryButton label={"UPDATE " + targetPlant.nickname.toUpperCase()} onPress={() => onApplyToPlant(targetPlant.id)} /> : null}
        <SecondaryButton label="SAVE AS NEW PLANT" onPress={onSave} />
        <SecondaryButton label="SCAN AGAIN" onPress={onRescan} />
      </View>

      {!targetPlant && plants.length > 0 ? (
        <>
          <SectionTitle title="ATTACH TO EXISTING PLANT" />
          <Card>
            {plants.slice(0, 6).map((plant) => (
              <Pressable key={plant.id} style={styles.existingPlantRow} onPress={() => onApplyToPlant(plant.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plantName}>{plant.nickname}</Text>
                  <Text style={styles.plantLatin}>{plant.location} • {plant.scientificName}</Text>
                </View>
                <Text style={styles.existingPlantScore}>{plant.healthScore} → {result.healthScore}</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function CollectionScreen({ plants, onOpen }: { plants: Plant[]; onOpen: (id: string) => void }) {
  const healthy = plants.filter((plant) => plant.healthScore >= 75).length;
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <DpnHeader eyebrow="PLANT NETWORK // COLLECTION" title="My Plants" subtitle={healthy + " healthy • " + (plants.length - healthy) + " need attention"} />
      {plants.map((plant) => (
        <Pressable key={plant.id} onPress={() => onOpen(plant.id)}>
          <Card style={styles.collectionCard}>
            {plant.imageUri ? (
              <Image source={{ uri: plant.imageUri }} style={styles.collectionImage} />
            ) : (
              <View style={styles.collectionImageFallback}><Text style={styles.plantGlyphText}>♧</Text></View>
            )}
            <View style={styles.collectionCopy}>
              <Text style={styles.plantName}>{plant.nickname}</Text>
              <Text style={styles.plantLatin}>{plant.scientificName}</Text>
              <View style={styles.tagRow}>
                <Pill label={plant.location.toUpperCase()} tone="muted" />
                {plant.healthScore < 75 ? <Pill label="ATTENTION" tone="amber" /> : <Pill label="STABLE" />}
              </View>
            </View>
            <View style={styles.miniScore}>
              <Text style={styles.miniScoreValue}>{plant.healthScore}</Text>
              <Text style={styles.miniScoreLabel}>PULSE</Text>
            </View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function RecommendationCard({
  plant,
  recommendation,
  onFeedback,
  onApply
}: {
  plant: Plant;
  recommendation: CareRecommendation;
  onFeedback: (plantId: string, recommendationId: string, value: RecommendationFeedbackValue) => void;
  onApply: (plantId: string, recommendation: CareRecommendation) => void;
}) {
  const feedback = plant.recommendationFeedback.find((item) => item.recommendationId === recommendation.id);
  const canApply = recommendation.suggestedWaterIntervalDays !== undefined || recommendation.suggestedFeedIntervalDays !== undefined;

  return (
    <Card style={styles.recommendationCard}>
      <View style={styles.recommendationTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recommendationMeta}>{recommendation.priority} // {recommendation.category.toUpperCase()}</Text>
          <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
        </View>
        <Text style={styles.recommendationConfidence}>{recommendation.confidence}%</Text>
      </View>
      <Text style={styles.recommendationDetail}>{recommendation.detail}</Text>
      {recommendation.rationale.map((reason) => (
        <Text key={reason} style={styles.recommendationReason}>• {reason}</Text>
      ))}
      {feedback ? <Text style={styles.feedbackState}>YOUR FEEDBACK // {feedback.value}</Text> : null}
      <View style={styles.recommendationActions}>
        <Pressable style={styles.feedbackButton} onPress={() => onFeedback(plant.id, recommendation.id, "HELPFUL")}>
          <Text style={styles.feedbackButtonText}>HELPFUL</Text>
        </Pressable>
        <Pressable style={styles.feedbackButton} onPress={() => onFeedback(plant.id, recommendation.id, "NOT_HELPFUL")}>
          <Text style={styles.feedbackButtonText}>NOT HELPFUL</Text>
        </Pressable>
        <Pressable style={styles.feedbackButton} onPress={() => onFeedback(plant.id, recommendation.id, "DISMISSED")}>
          <Text style={styles.feedbackButtonText}>DISMISS</Text>
        </Pressable>
        {canApply ? (
          <Pressable style={styles.applyButton} onPress={() => onApply(plant.id, recommendation)}>
            <Text style={styles.applyButtonText}>APPLY CHANGE</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function PlantScreen({
  plant,
  onBack,
  onCare,
  onUpdate,
  onRecommendationFeedback,
  onApplyRecommendation,
  onAcknowledgeSensorAlert,
  onGeneratePlantTag
}: {
  plant: Plant;
  onBack: () => void;
  onCare: (plantId: string, action: CareAction) => void;
  onUpdate: (plantId: string, update: PlantProfileUpdate) => void;
  onRecommendationFeedback: (plantId: string, recommendationId: string, value: RecommendationFeedbackValue) => void;
  onApplyRecommendation: (plantId: string, recommendation: CareRecommendation) => void;
  onAcknowledgeSensorAlert: (plantId: string, alertId: string) => void;
  onGeneratePlantTag: (plantId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(plant.nickname);
  const [location, setLocation] = useState(plant.location);
  const [waterInterval, setWaterInterval] = useState(String(plant.carePlan.waterIntervalDays));
  const [feedInterval, setFeedInterval] = useState(String(plant.carePlan.feedIntervalDays));
  const [notes, setNotes] = useState(plant.notes ?? "");
  const intelligence = useMemo(() => buildCareIntelligence(plant), [plant]);
  const speciesBaseline = useMemo(() => getSpeciesCareBaseline(plant), [plant]);
  const sensorSnapshot = useMemo(() => buildSensorNetworkSnapshot(plant), [plant]);

  useEffect(() => {
    setNickname(plant.nickname);
    setLocation(plant.location);
    setWaterInterval(String(plant.carePlan.waterIntervalDays));
    setFeedInterval(String(plant.carePlan.feedIntervalDays));
    setNotes(plant.notes ?? "");
  }, [plant.id, plant.nickname, plant.location, plant.carePlan.waterIntervalDays, plant.carePlan.feedIntervalDays, plant.notes]);

  const saveProfile = () => {
    const waterDays = Number(waterInterval);
    const feedDays = Number(feedInterval);
    if (!Number.isFinite(waterDays) || waterDays < 1 || !Number.isFinite(feedDays) || feedDays < 1) {
      Alert.alert("Invalid care interval", "Water and feed intervals must be at least 1 day.");
      return;
    }
    onUpdate(plant.id, {
      nickname,
      location,
      waterIntervalDays: waterDays,
      feedIntervalDays: feedDays,
      notes
    });
    setEditing(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Pressable onPress={onBack}><Text style={styles.back}>← PLANT NETWORK</Text></Pressable>
      <View style={styles.profileTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PLANT PROFILE // ADAPTIVE INTELLIGENCE</Text>
          <Text style={styles.resultName}>{plant.nickname}</Text>
          <Text style={styles.plantLatin}>{plant.commonName} • {plant.scientificName} • {plant.location}</Text>
        </View>
        <ScoreBadge score={plant.healthScore} band={scoreBand(plant.healthScore)} />
      </View>

      {plant.imageUri ? <Image source={{ uri: plant.imageUri }} style={styles.resultImage} /> : null}

      <SectionTitle title="PREDICTION ENGINE" action="7-DAY ADVISORY" />
      <Card style={styles.predictionCard}>
        <View style={styles.predictionHeader}>
          <View>
            <Text style={styles.predictionLabel}>PROJECTED PLANTPULSE</Text>
            <Text style={styles.projectedScore}>{intelligence.prediction.projectedScore}</Text>
          </View>
          <View style={styles.predictionRiskBox}>
            <Text style={styles.predictionRisk}>{intelligence.prediction.risk}</Text>
            <Text style={styles.predictionConfidence}>{intelligence.prediction.confidence}% CONFIDENCE</Text>
          </View>
        </View>
        <View style={styles.trendRow}>
          <Text style={styles.trendDirection}>{intelligence.trend.direction}</Text>
          <Text style={styles.trendMeta}>
            {intelligence.trend.scoreDelta >= 0 ? "+" : ""}{intelligence.trend.scoreDelta} points • {intelligence.trend.sampleCount} scans
          </Text>
        </View>
        <Text style={styles.infoBody}>{intelligence.trend.summary}</Text>
        {intelligence.prediction.reasons.map((reason) => (
          <Text key={reason} style={styles.predictionReason}>• {reason}</Text>
        ))}
        <Text style={styles.predictionDisclaimer}>{intelligence.prediction.disclaimer}</Text>
      </Card>

      {speciesBaseline ? (
        <Card style={styles.speciesBaselineCard}>
          <Text style={styles.infoTitle}>SPECIES-AWARE PLANNING BASELINE</Text>
          <Text style={styles.infoBody}>
            Prototype water-check baseline {speciesBaseline.waterCheckIntervalDays}d • feed-review baseline {speciesBaseline.feedReviewIntervalDays}d
          </Text>
          <Text style={styles.predictionDisclaimer}>{speciesBaseline.note}</Text>
        </Card>
      ) : null}

      <SectionTitle title="ADAPTIVE RECOMMENDATIONS" action={intelligence.recommendations.length + " ACTIVE"} />
      {intelligence.recommendations.map((recommendation) => (
        <RecommendationCard
          key={recommendation.id}
          plant={plant}
          recommendation={recommendation}
          onFeedback={onRecommendationFeedback}
          onApply={onApplyRecommendation}
        />
      ))}

      <View style={styles.statGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>NEXT WATER</Text>
          <Text style={styles.statValue}>{Math.max(0, daysUntil(plant.nextWaterAt))}</Text>
          <Text style={styles.statMeta}>{careDueLabel(plant.nextWaterAt)}</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>NEXT FEED</Text>
          <Text style={styles.statValue}>{Math.max(0, daysUntil(plant.nextFeedAt))}</Text>
          <Text style={styles.statMeta}>{careDueLabel(plant.nextFeedAt)}</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>SCANS</Text>
          <Text style={styles.statValue}>{plant.scanHistory.length}</Text>
          <Text style={styles.statMeta}>HISTORY</Text>
        </Card>
      </View>

      <SectionTitle title="CARE ACTIONS" />
      <View style={styles.quickActionGrid}>
        {([
          ["water", "WATERED", "⌁"],
          ["fertilize", "FED", "✦"],
          ["inspect", "INSPECTED", "◎"],
          ["prune", "PRUNED", "✂"]
        ] as const).map(([action, label, icon]) => (
          <Pressable key={action} style={styles.quickAction} onPress={() => onCare(plant.id, action)}>
            <Text style={styles.quickActionIcon}>{icon}</Text>
            <Text style={styles.quickActionText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.profileActions}>
        <SecondaryButton label={editing ? "CANCEL EDIT" : "EDIT PROFILE / LOCATION"} onPress={() => setEditing((value) => !value)} />
      </View>

      {editing ? (
        <Card style={styles.editCard}>
          <Text style={styles.fieldLabel}>PLANT NAME</Text>
          <TextInput value={nickname} onChangeText={setNickname} style={styles.editInput} placeholderTextColor="#637268" />

          <Text style={styles.fieldLabel}>ROOM / LOCATION</Text>
          <TextInput value={location} onChangeText={setLocation} style={styles.editInput} placeholder="Living Room" placeholderTextColor="#637268" />

          <View style={styles.editGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>WATER CHECK EVERY</Text>
              <TextInput value={waterInterval} onChangeText={setWaterInterval} keyboardType="number-pad" style={styles.editInput} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>FEED REVIEW EVERY</Text>
              <TextInput value={feedInterval} onChangeText={setFeedInterval} keyboardType="number-pad" style={styles.editInput} />
            </View>
          </View>

          <Text style={styles.fieldLabel}>NOTES</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            style={[styles.editInput, styles.editArea]}
            placeholder="Growth notes, placement, potting mix..."
            placeholderTextColor="#637268"
          />
          <PrimaryButton label="SAVE PLANT PROFILE" onPress={saveProfile} />
        </Card>
      ) : null}

      <SectionTitle title="DPN PLATFORM RECORD" action={plant.sync.state} />
      <Card style={styles.platformRecordCard}>
        <View style={styles.syncRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>REVISION {plant.sync.localRevision}</Text>
            <Text style={styles.timelineDate}>
              {plant.sync.remoteRevision !== undefined ? "REMOTE " + plant.sync.remoteRevision : "NO REMOTE REVISION"} • UPDATED {new Date(plant.sync.updatedAt).toLocaleString()}
            </Text>
          </View>
          <Pill
            label={plant.sync.state}
            tone={plant.sync.state === "SYNCED" ? "green" : plant.sync.state === "CONFLICT" || plant.sync.state === "ERROR" ? "red" : "amber"}
          />
        </View>
        {plant.sync.lastError ? <Text style={styles.warningText}>{plant.sync.lastError}</Text> : null}
        {plant.plantTag ? (
          <View style={styles.tagPayloadCard}>
            <Text style={styles.fieldLabel}>PLANTPULSE TAG</Text>
            <Text style={styles.tagPayloadText}>{plant.plantTag.tagId}</Text>
            <Text style={styles.tagPayloadUri}>{plant.plantTag.payload}</Text>
          </View>
        ) : (
          <SecondaryButton label="GENERATE PLANT TAG" onPress={() => onGeneratePlantTag(plant.id)} />
        )}
      </Card>

      <SectionTitle title="SENSOR TELEMETRY" action={plant.sensorDevices.length + " DEVICES"} />
      <Card style={styles.sensorPanel}>
        {plant.sensorDevices.length === 0 ? (
          <>
            <Text style={styles.infoTitle}>NO HARDWARE CONNECTED</Text>
            <Text style={styles.infoBody}>The v0.5 telemetry pipeline is ready for Wi-Fi gateway ingestion and a future native BLE adapter. No simulated sensor readings are shown as real data.</Text>
          </>
        ) : (
          <>
            <View style={styles.sensorSummaryRow}>
              <Text style={styles.sensorSummary}>ONLINE {sensorSnapshot.online}</Text>
              <Text style={styles.sensorSummary}>STALE {sensorSnapshot.stale}</Text>
              <Text style={styles.sensorSummary}>OFFLINE {sensorSnapshot.offline}</Text>
              <Text style={styles.sensorSummary}>ALERTS {sensorSnapshot.alertCount}</Text>
            </View>
            <TelemetryGrid readings={sensorSnapshot.latestReadings} />
            {plant.sensorAlerts.filter((alert) => !alert.acknowledgedAt).slice(0, 4).map((alert) => (
              <View key={alert.id} style={styles.sensorAlertRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sensorAlertTitle}>{alert.severity} // {alert.title}</Text>
                  <Text style={styles.sensorAlertDetail}>{alert.detail}</Text>
                </View>
                <Pressable style={styles.feedbackButton} onPress={() => onAcknowledgeSensorAlert(plant.id, alert.id)}>
                  <Text style={styles.feedbackButtonText}>ACK</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
      </Card>

      <SectionTitle title="SCAN HISTORY" action={plant.scanHistory.length + " SAVED"} />
      <Card>
        {plant.scanHistory.length === 0 ? (
          <Text style={styles.emptyText}>Add at least two saved scans to enable a meaningful health trend and prediction confidence.</Text>
        ) : (
          plant.scanHistory.slice(0, 6).map((scan) => (
            <View key={scan.id} style={styles.scanHistoryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineLabel}>{scan.mode.toUpperCase()} • {scan.commonName}</Text>
                <Text style={styles.timelineDate}>{new Date(scan.createdAt).toLocaleString()} • {scan.identificationStatus} • confidence {scan.identificationConfidence}% • {scan.engine}</Text>
              </View>
              <Text style={styles.scanHistoryScore}>{scan.healthScore}</Text>
            </View>
          ))
        )}
      </Card>

      <SectionTitle title="PLANT TIMELINE" />
      <Card>
        {plant.timeline.map((event) => (
          <View key={event.id} style={styles.timelineRow}>
            <View style={styles.timelineDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineLabel}>{event.label}</Text>
              <Text style={styles.timelineDate}>{new Date(event.at).toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </Card>

      {plant.notes ? (
        <>
          <SectionTitle title="PLANT NOTES" />
          <Card><Text style={styles.bulletText}>{plant.notes}</Text></Card>
        </>
      ) : null}

      <SectionTitle title="TOXICITY PROFILE" />
      <Card style={styles.warningCard}>
        <Text style={styles.warningText}>{plant.toxicity}</Text>
      </Card>
    </ScrollView>
  );
}

function CareScreen({
  plants,
  onCare,
  onRecommendationFeedback,
  onApplyRecommendation
}: {
  plants: Plant[];
  onCare: (plantId: string, action: CareAction) => void;
  onRecommendationFeedback: (plantId: string, recommendationId: string, value: RecommendationFeedbackValue) => void;
  onApplyRecommendation: (plantId: string, recommendation: CareRecommendation) => void;
}) {
  const sorted = [...plants].sort((a, b) => {
    const aIntel = buildCareIntelligence(a);
    const bIntel = buildCareIntelligence(b);
    const riskWeight = { HIGH: 4, ELEVATED: 3, WATCH: 2, LOW: 1 } as const;
    return riskWeight[bIntel.prediction.risk] - riskWeight[aIntel.prediction.risk];
  });

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <DpnHeader
        eyebrow="PLANTPULSE PREDICTION ENGINE // V0.4"
        title="Adaptive Care Command"
        subtitle="Care actions, scan trends, predictive risk, and explainable recommendations in one operational queue."
      />

      {sorted.map((plant) => {
        const intelligence = buildCareIntelligence(plant);
        const primaryRecommendation = intelligence.recommendations[0];

        return (
          <Card key={plant.id} style={styles.careCard}>
            <View style={styles.careCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.plantName}>{plant.nickname}</Text>
                <Text style={styles.plantLatin}>
                  {intelligence.trend.direction} • projected {intelligence.prediction.projectedScore}/100
                </Text>
              </View>
              <View style={styles.predictionRiskBox}>
                <Text style={styles.predictionRisk}>{intelligence.prediction.risk}</Text>
                <Text style={styles.predictionConfidence}>{intelligence.prediction.confidence}% CONF</Text>
              </View>
            </View>

            <View style={styles.careScheduleRow}>
              <Text style={styles.careScheduleText}>WATER {careDueLabel(plant.nextWaterAt)}</Text>
              <Text style={styles.careScheduleText}>FEED {careDueLabel(plant.nextFeedAt)}</Text>
            </View>

            {primaryRecommendation ? (
              <View style={styles.careRecommendationPreview}>
                <Text style={styles.recommendationMeta}>{primaryRecommendation.priority} // TOP RECOMMENDATION</Text>
                <Text style={styles.recommendationTitle}>{primaryRecommendation.title}</Text>
                <Text style={styles.recommendationDetail}>{primaryRecommendation.detail}</Text>
                <View style={styles.recommendationActions}>
                  <Pressable style={styles.feedbackButton} onPress={() => onRecommendationFeedback(plant.id, primaryRecommendation.id, "HELPFUL")}>
                    <Text style={styles.feedbackButtonText}>HELPFUL</Text>
                  </Pressable>
                  {(primaryRecommendation.suggestedWaterIntervalDays !== undefined || primaryRecommendation.suggestedFeedIntervalDays !== undefined) ? (
                    <Pressable style={styles.applyButton} onPress={() => onApplyRecommendation(plant.id, primaryRecommendation)}>
                      <Text style={styles.applyButtonText}>APPLY</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.careActionRow}>
              <Pressable style={styles.careMiniButton} onPress={() => onCare(plant.id, "water")}>
                <Text style={styles.careMiniButtonText}>✓ WATERED</Text>
              </Pressable>
              <Pressable style={styles.careMiniButton} onPress={() => onCare(plant.id, "fertilize")}>
                <Text style={styles.careMiniButtonText}>✓ FED</Text>
              </Pressable>
              <Pressable style={styles.careMiniButton} onPress={() => onCare(plant.id, "inspect")}>
                <Text style={styles.careMiniButtonText}>◎ INSPECT</Text>
              </Pressable>
            </View>
          </Card>
        );
      })}

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>ADVISORY / EXPLAINABLE BY DESIGN</Text>
        <Text style={styles.infoBody}>PlantPulse v0.4 never treats photo-derived hydration as real soil moisture and never changes a schedule silently. Adaptive changes require an explicit APPLY action and remain visible in the timeline.</Text>
      </Card>
    </ScrollView>
  );
}

function metricLabel(metric: SensorMetric): string {
  const labels: Record<SensorMetric, string> = {
    soilMoisture: "SOIL MOISTURE",
    soilTemperature: "SOIL TEMP",
    airTemperature: "AIR TEMP",
    humidity: "HUMIDITY",
    light: "LIGHT",
    ec: "EC",
    ph: "PH"
  };
  return labels[metric];
}

function readingText(reading: SensorReading): string {
  return reading.value + " " + reading.unit;
}

function TelemetryGrid({ readings }: { readings: Partial<Record<SensorMetric, SensorReading>> }) {
  const metrics: SensorMetric[] = ["soilMoisture", "soilTemperature", "airTemperature", "humidity", "light", "ec", "ph"];
  const available = metrics.filter((metric) => Boolean(readings[metric]));

  if (!available.length) {
    return <Text style={styles.emptyText}>No valid measured telemetry has been received yet.</Text>;
  }

  return (
    <View style={styles.telemetryGrid}>
      {available.map((metric) => {
        const reading = readings[metric]!;
        return (
          <View key={metric} style={styles.telemetryTile}>
            <Text style={styles.telemetryLabel}>{metricLabel(metric)}</Text>
            <Text style={styles.telemetryValue}>{readingText(reading)}</Text>
            <Text style={styles.telemetryMeta}>MEASURED • {reading.quality}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TelemetryHistory({ readings }: { readings: SensorReading[] }) {
  const valid = [...readings]
    .filter((reading) => reading.quality !== "INVALID")
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime())
    .slice(-18);

  if (valid.length < 2) return null;

  const values = valid.map((reading) => reading.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  return (
    <View style={styles.telemetryHistoryWrap}>
      <View style={styles.telemetryHistoryHeader}>
        <Text style={styles.telemetryHistoryTitle}>{metricLabel(valid[0]!.metric)} HISTORY</Text>
        <Text style={styles.telemetryHistoryRange}>{min}–{max} {valid[0]!.unit}</Text>
      </View>
      <View style={styles.telemetryBars}>
        {valid.map((reading) => {
          const height = 12 + ((reading.value - min) / range) * 48;
          return (
            <View
              key={reading.id}
              style={[styles.telemetryBar, { height }]}
            />
          );
        })}
      </View>
      <Text style={styles.telemetryMeta}>MEASURED HISTORY • LAST {valid.length} VALID READINGS</Text>
    </View>
  );
}

function SensorNetworkScreen({
  plants,
  onAcknowledge
}: {
  plants: Plant[];
  onAcknowledge: (plantId: string, alertId: string) => void;
}) {
  const plantNetworks = plants.map((plant) => ({
    plant,
    snapshot: buildSensorNetworkSnapshot(plant)
  }));
  const totalDevices = plants.reduce((sum, plant) => sum + plant.sensorDevices.length, 0);
  const totalAlerts = plants.reduce(
    (sum, plant) => sum + plant.sensorAlerts.filter((alert) => !alert.acknowledgedAt).length,
    0
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <DpnHeader
        eyebrow="DPN PLANTPULSE // SENSOR NETWORK V0.5"
        title="Sensor Network"
        subtitle="Measured plant telemetry, device health, gateway ingestion, and anomaly visibility."
      />

      <View style={styles.statGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>DEVICES</Text>
          <Text style={styles.statValue}>{totalDevices}</Text>
          <Text style={styles.statMeta}>REGISTERED</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>OPEN ALERTS</Text>
          <Text style={[styles.statValue, totalAlerts > 0 && { color: colors.amber }]}>{totalAlerts}</Text>
          <Text style={styles.statMeta}>SENSOR HEALTH</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>TRANSPORTS</Text>
          <Text style={styles.statValue}>2</Text>
          <Text style={styles.statMeta}>BLE + WIFI</Text>
        </Card>
      </View>

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>HARDWARE BOUNDARY</Text>
        <Text style={styles.infoBody}>Wi-Fi gateway ingestion has a real HTTP client contract. Direct BLE has a native adapter contract but is not falsely marked operational in Expo Go; a native BLE implementation/dev build is still required.</Text>
      </Card>

      {plantNetworks.map(({ plant, snapshot }) => (
        <Card key={plant.id} style={styles.sensorPlantCard}>
          <View style={styles.sensorPlantTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.plantName}>{plant.nickname}</Text>
              <Text style={styles.plantLatin}>{plant.location} • {plant.sensorDevices.length} devices</Text>
            </View>
            <Text style={styles.sensorAlertCount}>{snapshot.alertCount} ALERTS</Text>
          </View>

          <TelemetryGrid readings={snapshot.latestReadings} />
          {(["soilMoisture", "light", "airTemperature", "humidity"] as SensorMetric[]).map((metric) => {
            const metricReadings = plant.sensorReadings.filter((reading) => reading.metric === metric);
            return metricReadings.length >= 2 ? <TelemetryHistory key={metric} readings={metricReadings} /> : null;
          })}

          {plant.sensorDevices.map((device) => (
            <View key={device.id} style={styles.sensorDeviceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineLabel}>{device.name}</Text>
                <Text style={styles.timelineDate}>{device.transport} • {device.capabilities.map(metricLabel).join(" • ")}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.sensorStatus}>{sensorStatus(device)}</Text>
                <Text style={styles.timelineDate}>{device.batteryPercent !== undefined ? device.batteryPercent + "% BAT" : "BAT N/A"}</Text>
              </View>
            </View>
          ))}

          {plant.sensorAlerts.filter((alert) => !alert.acknowledgedAt).slice(0, 5).map((alert) => (
            <View key={alert.id} style={styles.sensorAlertRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sensorAlertTitle}>{alert.severity} // {alert.title}</Text>
                <Text style={styles.sensorAlertDetail}>{alert.detail}</Text>
              </View>
              <Pressable style={styles.feedbackButton} onPress={() => onAcknowledge(plant.id, alert.id)}>
                <Text style={styles.feedbackButtonText}>ACK</Text>
              </Pressable>
            </View>
          ))}

          {plant.sensorDevices.length === 0 ? (
            <Text style={styles.emptyText}>No sensor hardware registered for this plant.</Text>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

function PlatformScreen({
  plants,
  platformState,
  syncing,
  onOpenPlant,
  onReadNotification,
  onSync,
  onConnectDevelopment,
  oidcIssuer,
  oidcReady,
  oidcPreparing,
  oidcError,
  onOidcSignIn,
  onDisconnect,
  onRegisterPush,
  onTestBackgroundSync,
  onSaveNotificationPreferences,
  onRefreshControlPlane,
  onRevokeDevice,
  onResolveConflict
}: {
  plants: Plant[];
  platformState: PlatformState;
  syncing: boolean;
  onOpenPlant: (plantId: string) => void;
  onReadNotification: (notificationId: string) => void;
  onSync: () => void;
  onConnectDevelopment: (baseUrl: string, tenantId: string, userId: string) => void;
  oidcIssuer?: string;
  oidcReady: boolean;
  oidcPreparing: boolean;
  oidcError: string | null;
  onOidcSignIn: () => void;
  onDisconnect: () => void;
  onRegisterPush: () => void;
  onTestBackgroundSync: () => void;
  onSaveNotificationPreferences: (preferences: NotificationPreferences) => void;
  onRefreshControlPlane: () => void;
  onRevokeDevice: (deviceId: string) => void;
  onResolveConflict: (conflict: SyncConflict, strategy: "KEEP_LOCAL" | "USE_REMOTE") => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningTag, setScanningTag] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [endpoint, setEndpoint] = useState(platformState.platformBaseUrl ?? "");
  const [tenantId, setTenantId] = useState(platformState.identity.profile?.tenantId ?? "dpn-local");
  const [userId, setUserId] = useState(platformState.identity.profile?.userId ?? "developer");
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    platformState.notificationPreferences ?? defaultNotificationPreferences()
  );

  useEffect(() => {
    if (platformState.platformBaseUrl) setEndpoint(platformState.platformBaseUrl);
  }, [platformState.platformBaseUrl]);

  useEffect(() => {
    if (platformState.notificationPreferences) {
      setPreferences(platformState.notificationPreferences);
    }
  }, [platformState.notificationPreferences]);

  const synced = plants.filter((plant) => plant.sync.state === "SYNCED").length;
  const pending = plants.filter((plant) => ["LOCAL_ONLY", "DIRTY", "ERROR"].includes(plant.sync.state)).length;
  const conflicts = plants.filter((plant) => plant.sync.state === "CONFLICT").length;
  const pendingImages = plants.reduce(
    (sum, plant) =>
      sum +
      plant.scanHistory.filter((scan) => (scan.imageSyncState ?? "LOCAL_ONLY") !== "UPLOADED").length +
      (plant.imageUri && !plant.cloudImageKey ? 1 : 0),
    0
  );
  const unread = platformState.notifications.filter((item) => !item.readAt);
  const configured = Boolean(platformState.platformBaseUrl);
  const authenticated = platformState.identity.status === "AUTHENTICATED";
  const summary = platformState.lastSyncSummary;

  const handleTagScan = ({ data }: { data: string }) => {
    if (scanLocked) return;
    const tag = parsePlantTagPayload(data);
    if (!tag) return;

    setScanLocked(true);
    const plant = plants.find((item) => item.id === tag.plantId);
    if (!plant) {
      Alert.alert("Plant not found", "This PlantPulse tag is valid, but its plant is not present on this device.");
      setTimeout(() => setScanLocked(false), 1200);
      return;
    }

    if (plant.plantTag && plant.plantTag.tagId !== tag.tagId) {
      Alert.alert("Tag mismatch", "The tag ID does not match the current local tag assigned to this plant.");
      setTimeout(() => setScanLocked(false), 1200);
      return;
    }

    setScanningTag(false);
    setScanLocked(false);
    onOpenPlant(plant.id);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <DpnHeader
        eyebrow="DPN PLANTPULSE // PLATFORM V0.11"
        title="DPN Platform"
        subtitle="DPN Identity, synchronized plant records, notification policy, trusted-device control, background operations, and observable delivery health."
      />

      <View style={styles.statGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>SYNCED</Text>
          <Text style={styles.statValue}>{synced}</Text>
          <Text style={styles.statMeta}>PLANTS</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>PENDING</Text>
          <Text style={[styles.statValue, pending > 0 && { color: colors.amber }]}>{pending}</Text>
          <Text style={styles.statMeta}>LOCAL CHANGES</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>CONFLICTS</Text>
          <Text style={[styles.statValue, conflicts > 0 && { color: colors.red }]}>{conflicts}</Text>
          <Text style={styles.statMeta}>BLOCKED</Text>
        </Card>
      </View>

      <Card style={styles.platformIdentityCard}>
        <View style={styles.syncRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>DPN IDENTITY</Text>
            <Text style={styles.infoBody}>
              {platformState.identity.profile?.displayName ?? "No DPN account connected"}
            </Text>
            <Text style={styles.timelineDate}>{platformState.platformBaseUrl ?? "NO PLATFORM ENDPOINT"}</Text>
            <Text style={styles.timelineDate}>IDENTITY PROVIDER • {platformState.identity.provider?.toUpperCase() ?? "NONE"}</Text>
          </View>
          <Pill
            label={platformState.identity.status}
            tone={authenticated ? "green" : "muted"}
          />
        </View>
        <Text style={styles.platformSecurityNote}>
          Native sessions are encrypted with Expo SecureStore. Bearer tokens are never written to AsyncStorage. Web sessions remain runtime-only.
        </Text>
        {authenticated ? (
          <View style={styles.buttonStack}>
            <PrimaryButton label={syncing ? "SYNCHRONIZING..." : "SYNC DPN PLATFORM"} onPress={onSync} disabled={syncing || !configured} />
            <SecondaryButton label="REGISTER PUSH + DEVICE" onPress={onRegisterPush} />
            <SecondaryButton label="DISCONNECT DPN IDENTITY" onPress={onDisconnect} />
          </View>
        ) : (
          <View style={styles.buttonStack}>
            <PrimaryButton
              label={oidcPreparing ? "PREPARING DPN IDENTITY..." : "SIGN IN WITH DPN ONE"}
              onPress={onOidcSignIn}
              disabled={!oidcReady || oidcPreparing}
            />
            <Text style={styles.platformSecurityNote}>
              {oidcReady
                ? "OIDC READY • " + (oidcIssuer ?? "configured issuer") + " • Authorization Code + PKCE"
                : (oidcError ?? "Production DPN Identity client registration is not configured.")}
            </Text>
          </View>
        )}
      </Card>

      {__DEV__ ? (
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>LOCAL DPN PLATFORM CONNECTION // DEVELOPMENT ONLY</Text>
          <Text style={styles.infoBody}>
            Connect this development build to the v0.7 local Fastify/PostgreSQL service. Release builds do not expose development identity.
          </Text>
          <Text style={styles.fieldLabel}>PLATFORM URL</Text>
          <TextInput
            value={endpoint}
            onChangeText={setEndpoint}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.x.x:8787"
            placeholderTextColor="#637268"
            style={styles.editInput}
          />
          <Text style={styles.fieldLabel}>TENANT ID</Text>
          <TextInput value={tenantId} onChangeText={setTenantId} autoCapitalize="none" style={styles.editInput} />
          <Text style={styles.fieldLabel}>USER ID</Text>
          <TextInput value={userId} onChangeText={setUserId} autoCapitalize="none" style={styles.editInput} />
          <PrimaryButton
            label="CONNECT DEVELOPMENT PLATFORM"
            onPress={() => onConnectDevelopment(endpoint, tenantId, userId)}
          />
        </Card>
      ) : null}

      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          CLOUD BACKEND STATUS // {authenticated && configured ? "CONNECTED" : configured ? "ENDPOINT READY" : "LOCAL ONLY"}
        </Text>
        <Text style={styles.infoBody}>
          v0.8 executes signed image uploads and revisioned plant synchronization against the configured DPN Platform endpoint. Failed work is retained locally with retry metadata.
        </Text>
        <View style={styles.platformMetricRow}>
          <Text style={styles.platformMetric}>MEDIA PENDING {pendingImages}</Text>
          <Text style={styles.platformMetric}>NOTIFICATIONS {unread.length}</Text>
          <Text style={styles.platformMetric}>DEVICE {platformState.device ? "ENROLLED" : "—"}</Text>
          <Text style={styles.platformMetric}>BG {platformState.backgroundSync?.registered ? "REGISTERED" : platformState.backgroundSync?.availability ?? "UNKNOWN"}</Text>
        </View>
        {summary ? (
          <Text style={styles.timelineDate}>
            LAST SYNC • RECORDS {summary.pushed}↑/{summary.pulled}↓ • MEDIA {summary.uploadedImages} • TAGS {summary.claimedTags} • PUSH QUEUED {summary.queuedNotifications} • FAILED {summary.failed}
          </Text>
        ) : null}
        {platformState.lastSyncError ? <Text style={styles.warningText}>{platformState.lastSyncError}</Text> : null}
        {platformState.nextRetryAt ? (
          <Text style={styles.timelineDate}>NEXT RETRY {new Date(platformState.nextRetryAt).toLocaleString()}</Text>
        ) : null}
        {platformState.backgroundSync?.lastRunAt ? (
          <Text style={styles.timelineDate}>
            BACKGROUND • {platformState.backgroundSync.lastResult ?? "UNKNOWN"} • {new Date(platformState.backgroundSync.lastRunAt).toLocaleString()}
          </Text>
        ) : null}
        {platformState.backgroundSync?.lastError ? (
          <Text style={styles.warningText}>BACKGROUND // {platformState.backgroundSync.lastError}</Text>
        ) : null}
        {__DEV__ ? <SecondaryButton label="TRIGGER BACKGROUND SYNC TEST" onPress={onTestBackgroundSync} /> : null}
      </Card>

      {authenticated && configured ? (
        <>
          <SectionTitle title="NOTIFICATION POLICY" action="SERVER ENFORCED" />
          <Card style={styles.infoCard}>
            {([
              ["care", "CARE"],
              ["prediction", "PREDICTION"],
              ["sensor", "SENSOR"],
              ["sync", "SYNC"],
              ["security", "SECURITY"]
            ] as Array<[keyof Pick<NotificationPreferences, "care" | "prediction" | "sensor" | "sync" | "security">, string]>).map(([key, label]) => (
              <View key={key} style={styles.platformPlantRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plantName}>{label}</Text>
                  <Text style={styles.plantLatin}>Remote delivery {preferences[key] ? "enabled" : "suppressed"}</Text>
                </View>
                <Pressable
                  style={preferences[key] ? styles.applyButton : styles.feedbackButton}
                  onPress={() => setPreferences((current) => ({ ...current, [key]: !current[key] }))}
                >
                  <Text style={preferences[key] ? styles.applyButtonText : styles.feedbackButtonText}>
                    {preferences[key] ? "ON" : "OFF"}
                  </Text>
                </Pressable>
              </View>
            ))}

            <View style={styles.platformPlantRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.plantName}>QUIET HOURS</Text>
                <Text style={styles.plantLatin}>Deferred, never discarded</Text>
              </View>
              <Pressable
                style={preferences.quietHoursEnabled ? styles.applyButton : styles.feedbackButton}
                onPress={() => setPreferences((current) => ({
                  ...current,
                  quietHoursEnabled: !current.quietHoursEnabled
                }))}
              >
                <Text style={preferences.quietHoursEnabled ? styles.applyButtonText : styles.feedbackButtonText}>
                  {preferences.quietHoursEnabled ? "ON" : "OFF"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>QUIET START // HH:MM</Text>
            <TextInput
              value={preferences.quietStart}
              onChangeText={(quietStart) => setPreferences((current) => ({ ...current, quietStart }))}
              autoCapitalize="none"
              style={styles.editInput}
            />
            <Text style={styles.fieldLabel}>QUIET END // HH:MM</Text>
            <TextInput
              value={preferences.quietEnd}
              onChangeText={(quietEnd) => setPreferences((current) => ({ ...current, quietEnd }))}
              autoCapitalize="none"
              style={styles.editInput}
            />
            <Text style={styles.fieldLabel}>TIME ZONE // IANA</Text>
            <TextInput
              value={preferences.timeZone}
              onChangeText={(timeZone) => setPreferences((current) => ({ ...current, timeZone }))}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.editInput}
            />
            <PrimaryButton label="SAVE NOTIFICATION POLICY" onPress={() => onSaveNotificationPreferences(preferences)} />
          </Card>

          <SectionTitle title="DEVICE TRUST" action={(platformState.trustedDevices?.length ?? 0) + " DEVICES"} />
          {(platformState.trustedDevices ?? []).length === 0 ? (
            <Card><Text style={styles.emptyText}>No trusted device inventory has been loaded.</Text></Card>
          ) : (platformState.trustedDevices ?? []).map((device) => {
            const current = device.deviceId === platformState.device?.deviceId;
            return (
              <Card key={device.deviceId} style={styles.platformPlantRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plantName}>{device.name}</Text>
                  <Text style={styles.plantLatin}>
                    {device.platform.toUpperCase()} • LAST SEEN {new Date(device.lastSeenAt).toLocaleString()}
                  </Text>
                  {device.revokedAt ? <Text style={styles.warningText}>REVOKED {new Date(device.revokedAt).toLocaleString()}</Text> : null}
                </View>
                <View style={styles.buttonStack}>
                  <Pill label={current ? "CURRENT" : device.revokedAt ? "REVOKED" : "TRUSTED"} tone={device.revokedAt ? "red" : "green"} />
                  {!current && !device.revokedAt ? (
                    <Pressable style={styles.feedbackButton} onPress={() => onRevokeDevice(device.deviceId)}>
                      <Text style={styles.feedbackButtonText}>REVOKE</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            );
          })}

          <SectionTitle title="OPERATIONAL HEALTH" action="DURABLE TELEMETRY" />
          <Card style={styles.infoCard}>
            {platformState.operationalHealth ? (
              <>
                <View style={styles.platformMetricRow}>
                  <Text style={styles.platformMetric}>PLANTS {platformState.operationalHealth.plantCount}</Text>
                  <Text style={styles.platformMetric}>DEVICES {platformState.operationalHealth.activeDevices}</Text>
                  <Text style={styles.platformMetric}>REVOKED {platformState.operationalHealth.revokedDevices}</Text>
                </View>
                <View style={styles.platformMetricRow}>
                  <Text style={styles.platformMetric}>PENDING {platformState.operationalHealth.push.pending}</Text>
                  <Text style={styles.platformMetric}>RETRY {platformState.operationalHealth.push.retry}</Text>
                  <Text style={styles.platformMetric}>TICKETED {platformState.operationalHealth.push.ticketed}</Text>
                  <Text style={styles.platformMetric}>DELIVERED {platformState.operationalHealth.push.delivered}</Text>
                  <Text style={styles.platformMetric}>DEAD {platformState.operationalHealth.push.dead}</Text>
                </View>
                <Text style={styles.timelineDate}>
                  GENERATED {new Date(platformState.operationalHealth.generatedAt).toLocaleString()}
                </Text>
              </>
            ) : <Text style={styles.emptyText}>Operational telemetry has not been loaded.</Text>}
            <SecondaryButton label="REFRESH PLATFORM OPERATIONS" onPress={onRefreshControlPlane} />
          </Card>
        </>
      ) : null}

      {platformState.conflicts.length > 0 ? (
        <>
          <SectionTitle title="CONFLICT RESOLUTION" action={platformState.conflicts.length + " BLOCKED"} />
          {platformState.conflicts.map((conflict) => {
            const local = plants.find((plant) => plant.id === conflict.plantId);
            return (
              <Card key={conflict.id} style={styles.warningCard}>
                <Text style={styles.warningTitle}>{local?.nickname ?? conflict.plantId}</Text>
                <Text style={styles.warningText}>{conflict.detail}</Text>
                <Text style={styles.timelineDate}>
                  LOCAL r{conflict.localRevision} • REMOTE r{conflict.remoteRevision}
                </Text>
                <View style={styles.recommendationActions}>
                  <Pressable style={styles.applyButton} onPress={() => onResolveConflict(conflict, "KEEP_LOCAL")}>
                    <Text style={styles.applyButtonText}>KEEP LOCAL</Text>
                  </Pressable>
                  {conflict.remotePlant ? (
                    <Pressable style={styles.feedbackButton} onPress={() => onResolveConflict(conflict, "USE_REMOTE")}>
                      <Text style={styles.feedbackButtonText}>USE REMOTE</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            );
          })}
        </>
      ) : null}

      <SectionTitle title="PLANTPULSE TAGS" action="QR READER" />
      {!scanningTag ? (
        <PrimaryButton
          label="SCAN PLANTPULSE TAG"
          onPress={() => {
            setScanLocked(false);
            setScanningTag(true);
          }}
        />
      ) : !permission ? (
        <Card><ActivityIndicator color={colors.green} /></Card>
      ) : !permission.granted ? (
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>CAMERA ACCESS REQUIRED</Text>
          <Text style={styles.infoBody}>Camera access is required only while scanning a PlantPulse QR tag.</Text>
          <PrimaryButton label="GRANT CAMERA ACCESS" onPress={requestPermission} />
        </Card>
      ) : (
        <View style={styles.tagScannerShell}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleTagScan}
          />
          <View pointerEvents="none" style={styles.tagScannerOverlay}>
            <Text style={styles.reticleLabel}>SCAN PLANTPULSE QR TAG</Text>
          </View>
          <SecondaryButton label="CANCEL TAG SCAN" onPress={() => setScanningTag(false)} />
        </View>
      )}

      <SectionTitle title="SYNC STATE" action={plants.length + " RECORDS"} />
      {plants.map((plant) => (
        <Pressable key={plant.id} onPress={() => onOpenPlant(plant.id)}>
          <Card style={styles.platformPlantRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.plantName}>{plant.nickname}</Text>
              <Text style={styles.plantLatin}>
                LOCAL r{plant.sync.localRevision} • {plant.sync.remoteRevision !== undefined ? "REMOTE r" + plant.sync.remoteRevision : "REMOTE —"}
              </Text>
            </View>
            <Pill
              label={plant.sync.state}
              tone={plant.sync.state === "SYNCED" ? "green" : plant.sync.state === "CONFLICT" || plant.sync.state === "ERROR" ? "red" : "amber"}
            />
          </Card>
        </Pressable>
      ))}

      <SectionTitle title="NOTIFICATION CENTER" action={unread.length + " UNREAD"} />
      {platformState.notifications.length === 0 ? (
        <Card><Text style={styles.emptyText}>No local notification candidates are active.</Text></Card>
      ) : platformState.notifications.map((item) => (
        <Pressable key={item.id} onPress={() => onReadNotification(item.id)}>
          <Card style={[styles.platformNotificationCard, item.readAt && styles.platformNotificationRead]}>
            <Text style={styles.recommendationMeta}>{item.kind} // {item.readAt ? "READ" : "UNREAD"}</Text>
            <Text style={styles.recommendationTitle}>{item.title}</Text>
            <Text style={styles.recommendationDetail}>{item.body}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function AiScreen({ plants }: { plants: Plant[] }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "ai"; text: string }>>([
    { role: "ai", text: "PlantPulse AI local prototype online. Ask about watering, yellow leaves, light, pests, or one of your saved plants." }
  ]);

  const plantNames = useMemo(() => plants.map((plant) => plant.nickname).join(", "), [plants]);

  const send = () => {
    const question = input.trim();
    if (!question) return;
    const lower = question.toLowerCase();
    let answer = "The production PlantPulse AI will combine species data, scan history, care events, environmental context, and verified knowledge. The v0.1 assistant is intentionally rule-based.";
    if (lower.includes("yellow")) answer = "Yellow leaves can have several causes including watering stress, light stress, root problems, normal leaf aging, or nutrient imbalance. Check soil moisture, recent care history, and whether symptoms are spreading before changing multiple variables at once.";
    if (lower.includes("water")) answer = "Use the care queue as a reminder, then confirm actual soil moisture before watering. PlantPulse will eventually learn from your confirmations and optional moisture sensors.";
    if (lower.includes("light")) answer = "PlantPulse will estimate light compatibility from plant profile and environmental data. In v0.1, treat light guidance as a planning aid rather than a measurement.";
    if (lower.includes("pest")) answer = "Inspect leaf undersides, stems, and new growth. If pests are suspected, isolate the plant from the rest of the collection before applying treatment.";
    setMessages((current) => [...current, { role: "user", text: question }, { role: "ai", text: answer }]);
    setInput("");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.aiWrap}>
        <DpnHeader eyebrow="PLANTPULSE AI // LOCAL PROTOTYPE" title="Plant Doctor" subtitle={"Plant context loaded: " + plantNames} />
        <ScrollView style={styles.chat} contentContainerStyle={{ gap: 10 }}>
          {messages.map((message, index) => (
            <View key={String(index)} style={[styles.chatBubble, message.role === "user" ? styles.userBubble : styles.aiBubble]}>
              <Text style={styles.chatRole}>{message.role === "user" ? "YOU" : "PLANTPULSE AI"}</Text>
              <Text style={styles.chatText}>{message.text}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.chatInputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your plants..."
            placeholderTextColor="#637268"
            style={styles.chatInput}
            onSubmitEditing={send}
          />
          <Pressable onPress={send} style={styles.sendButton}><Text style={styles.sendButtonText}>↑</Text></Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  binaryTop: {
    minHeight: Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) + 26 : 50,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 24 : 20,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#16221B",
    backgroundColor: "#030504",
    paddingHorizontal: 14
  },
  binaryText: { color: "#2A4D38", fontSize: 8, fontWeight: "800", letterSpacing: 1.2 },
  body: { flex: 1 },
  scroll: { padding: 18, paddingBottom: 40, gap: 12 },
  eyebrow: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 },
  sectionTitleRow: { marginTop: 12, marginBottom: 2, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  sectionAction: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  heroCard: { overflow: "hidden", backgroundColor: "#0B1710", borderColor: "#275D3A" },
  heroGrid: { flexDirection: "row", gap: 16, alignItems: "center" },
  heroCopy: { flex: 1, alignItems: "flex-start", gap: 10 },
  heroTitle: { color: colors.text, fontWeight: "900", fontSize: 27, letterSpacing: -0.5 },
  heroText: { color: colors.muted, lineHeight: 20, fontSize: 13 },
  inlineCta: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineCtaText: { color: colors.green, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  inlineCtaArrow: { color: colors.green, fontSize: 20 },
  scannerOrb: {
    width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderColor: colors.green,
    alignItems: "center", justifyContent: "center", backgroundColor: "#07130C"
  },
  scannerOrbIcon: { color: colors.green, fontSize: 38, lineHeight: 40 },
  scannerOrbLabel: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  statGrid: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, minHeight: 105, justifyContent: "space-between", padding: 12 },
  statLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  statValue: { color: colors.green, fontSize: 30, fontWeight: "900" },
  statMeta: { color: colors.muted, fontSize: 8, fontWeight: "800" },
  plantRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  plantGlyph: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" },
  plantGlyphText: { color: colors.green, fontSize: 24, fontWeight: "900" },
  plantRowCopy: { flex: 1, gap: 3 },
  plantName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  plantLatin: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  miniScore: { alignItems: "center", minWidth: 46 },
  miniScoreValue: { color: colors.green, fontSize: 22, fontWeight: "900" },
  miniScoreLabel: { color: colors.muted, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  moduleCard: { width: "48%", minHeight: 100, justifyContent: "space-between" },
  moduleName: { color: colors.green, fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  moduleDescription: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  prototypeNote: { color: "#64766B", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 8 },
  scanScreen: { flex: 1, padding: 14, gap: 10 },
  scanHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  scanTitle: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 3 },
  modeStrip: { gap: 7, paddingVertical: 6, paddingRight: 16 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: "#0A0E0C" },
  modeChipActive: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  modeChipText: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  modeChipTextActive: { color: colors.green },
  contextLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  contextStrip: { gap: 7, paddingRight: 16 },
  contextChip: { minWidth: 125, paddingHorizontal: 11, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#080D0A" },
  contextChipActive: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  contextChipTitle: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  contextChipTitleActive: { color: colors.green },
  contextChipMeta: { color: colors.muted, fontSize: 8, marginTop: 3 },
  contextWarning: { color: colors.amber, fontSize: 9, lineHeight: 14, marginTop: 5 },
  contextReady: { color: colors.green, fontSize: 9, lineHeight: 14, marginTop: 5 },
  cameraShell: { flex: 1, minHeight: 360, maxHeight: 600, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: "#2B523A", backgroundColor: "#080C0A" },
  camera: { width: "100%", height: "100%" },
  cameraFallback: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 14 },
  cameraFallbackTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  cameraFallbackText: { color: colors.muted, fontSize: 12, textAlign: "center", lineHeight: 18 },
  reticle: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, margin: 26 },
  corner: { position: "absolute", width: 38, height: 38, borderColor: colors.green },
  tl: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3 },
  tr: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
  br: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  scanLine: { position: "absolute", left: 15, right: 15, top: "50%", height: 1, backgroundColor: colors.green, opacity: 0.75 },
  reticleLabel: { position: "absolute", bottom: 12, alignSelf: "center", color: colors.text, backgroundColor: "#00000099", paddingHorizontal: 10, paddingVertical: 6, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  scanControls: { minHeight: 76, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  primaryButton: { flex: 1, backgroundColor: colors.green, minHeight: 50, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primaryButtonText: { color: "#041108", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, backgroundColor: colors.panel },
  secondaryButtonText: { color: colors.text, fontWeight: "900", fontSize: 10, letterSpacing: 0.7, textAlign: "center" },
  disabled: { opacity: 0.5 },
  shutterOuter: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: colors.green, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.text },
  analysisCard: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 14 },
  analysisTitle: { color: colors.green, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  analysisText: { color: colors.muted, fontSize: 10, marginTop: 4 },
  resultTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  resultName: { color: colors.text, fontSize: 28, fontWeight: "900", marginTop: 5 },
  resultImage: { width: "100%", height: 280, borderRadius: radius.lg, backgroundColor: colors.panel },
  scorePanel: { flexDirection: "row", alignItems: "center", gap: 18 },
  scoreCopy: { flex: 1, gap: 5 },
  scoreHeadline: { color: colors.green, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  scoreBody: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  metricCard: { gap: 16 },
  bulletRow: { flexDirection: "row", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  bulletIndex: { color: colors.green, fontSize: 10, fontWeight: "900" },
  bulletText: { color: colors.text, flex: 1, fontSize: 12, lineHeight: 19 },
  actionRow: { flexDirection: "row", gap: 12, paddingVertical: 8 },
  actionCheck: { color: colors.green, fontSize: 14, fontWeight: "900" },
  warningCard: { borderColor: "#744E19", backgroundColor: "#1A1408" },
  warningTitle: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  warningText: { color: "#EADCBF", fontSize: 12, lineHeight: 18 },
  buttonStack: { gap: 8, marginTop: 8 },
  collectionCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 11 },
  collectionImage: { width: 66, height: 66, borderRadius: 16, backgroundColor: colors.panel2 },
  collectionImageFallback: { width: 66, height: 66, borderRadius: 16, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" },
  collectionCopy: { flex: 1, gap: 4 },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 },
  back: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 8 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  timelineRow: { flexDirection: "row", gap: 12, paddingVertical: 9 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green, marginTop: 4 },
  timelineLabel: { color: colors.text, fontSize: 12, fontWeight: "800" },
  timelineDate: { color: colors.muted, fontSize: 10, marginTop: 3 },
  careCard: { gap: 12 },
  careCardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  careDue: { alignItems: "center", minWidth: 64 },
  careDueValue: { color: colors.green, fontWeight: "900", fontSize: 12, textAlign: "center" },
  careDueLabel: { color: colors.muted, fontWeight: "900", fontSize: 7, letterSpacing: 1 },
  careActionRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  careMiniButton: { flexGrow: 1, minHeight: 38, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: "#275D3A", backgroundColor: "#0A1710", alignItems: "center", justifyContent: "center" },
  careMiniButtonText: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  infoCard: { marginTop: 8, borderColor: "#274A36" },
  infoTitle: { color: colors.green, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  infoBody: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 8 },
  aiWrap: { flex: 1, padding: 18 },
  chat: { flex: 1 },
  chatBubble: { padding: 13, borderRadius: 16, borderWidth: 1, maxWidth: "92%" },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.panel, borderColor: colors.border },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.greenSoft, borderColor: "#276841" },
  chatRole: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 5 },
  chatText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  chatInputRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  chatInput: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, color: colors.text, paddingHorizontal: 14 },
  sendButton: { width: 50, height: 50, borderRadius: 16, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  sendButtonText: { color: "#041108", fontSize: 22, fontWeight: "900" },
  existingPlantRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  existingPlantScore: { color: colors.green, fontSize: 12, fontWeight: "900" },
  candidateRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  candidateRank: { color: colors.green, fontSize: 9, fontWeight: "900" },
  candidateConfidence: { color: colors.text, fontSize: 14, fontWeight: "900" },
  captureGuide: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  findingCard: { gap: 8 },
  findingTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  findingCategory: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  findingTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 4 },
  findingConfidence: { color: colors.green, fontSize: 20, fontWeight: "900" },
  findingSummary: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  findingEvidenceLink: { color: "#6F8A7A", fontSize: 8, lineHeight: 13 },
  evidenceRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  evidenceConfidence: { color: colors.green, fontSize: 14, fontWeight: "900" },
  growthCard: { borderColor: "#275D3A" },
  growthTitle: { color: colors.green, fontSize: 22, fontWeight: "900" },
  quickActionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickAction: { width: "48%", minHeight: 64, borderRadius: radius.md, borderWidth: 1, borderColor: "#275D3A", backgroundColor: "#0A1710", alignItems: "center", justifyContent: "center", gap: 4 },
  quickActionIcon: { color: colors.green, fontSize: 18, fontWeight: "900" },
  quickActionText: { color: colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  profileActions: { flexDirection: "row" },
  editCard: { gap: 9 },
  fieldLabel: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 1.1, marginTop: 2 },
  editInput: { minHeight: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: "#080D0A", color: colors.text, paddingHorizontal: 12, paddingVertical: 10 },
  editArea: { minHeight: 90, textAlignVertical: "top" },
  editGrid: { flexDirection: "row", gap: 8 },
  scanHistoryRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  scanHistoryScore: { color: colors.green, fontSize: 20, fontWeight: "900", minWidth: 34, textAlign: "right" },
  emptyText: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  predictiveRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  predictionCard: { borderColor: "#275D3A", gap: 10 },
  predictionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  predictionLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  projectedScore: { color: colors.green, fontSize: 42, fontWeight: "900", marginTop: 2 },
  predictionRiskBox: { minWidth: 82, alignItems: "flex-end" },
  predictionRisk: { color: colors.amber, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  predictionConfidence: { color: colors.muted, fontSize: 7, fontWeight: "900", marginTop: 3 },
  trendRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
  trendDirection: { color: colors.green, fontSize: 12, fontWeight: "900" },
  trendMeta: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  predictionReason: { color: colors.text, fontSize: 10, lineHeight: 16 },
  predictionDisclaimer: { color: "#64766B", fontSize: 8, lineHeight: 13, marginTop: 4 },
  speciesBaselineCard: { borderColor: "#314535" },
  recommendationCard: { gap: 8 },
  recommendationTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  recommendationMeta: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  recommendationTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 4 },
  recommendationConfidence: { color: colors.green, fontSize: 18, fontWeight: "900" },
  recommendationDetail: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  recommendationReason: { color: colors.text, fontSize: 9, lineHeight: 15 },
  recommendationActions: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 3 },
  feedbackButton: { minHeight: 34, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: "#090D0B", alignItems: "center", justifyContent: "center" },
  feedbackButtonText: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  applyButton: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  applyButtonText: { color: "#041108", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  feedbackState: { color: colors.cyan, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  careScheduleRow: { flexDirection: "row", gap: 12 },
  careScheduleText: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  careRecommendationPreview: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
  sensorPanel: { gap: 10 },
  sensorSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sensorSummary: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  telemetryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  telemetryTile: { width: "48%", minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, backgroundColor: "#080D0A" },
  telemetryLabel: { color: colors.muted, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  telemetryValue: { color: colors.green, fontSize: 19, fontWeight: "900", marginTop: 5 },
  telemetryMeta: { color: "#6F8A7A", fontSize: 7, fontWeight: "800", marginTop: 4 },
  sensorPlantCard: { gap: 12 },
  sensorPlantTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sensorAlertCount: { color: colors.amber, fontSize: 9, fontWeight: "900" },
  sensorDeviceRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sensorStatus: { color: colors.green, fontSize: 9, fontWeight: "900" },
  sensorAlertRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sensorAlertTitle: { color: colors.amber, fontSize: 9, fontWeight: "900" },
  sensorAlertDetail: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  telemetryHistoryWrap: { gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 },
  telemetryHistoryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  telemetryHistoryTitle: { color: colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  telemetryHistoryRange: { color: colors.green, fontSize: 9, fontWeight: "900" },
  telemetryBars: { minHeight: 64, flexDirection: "row", alignItems: "flex-end", gap: 3 },
  telemetryBar: { flex: 1, minWidth: 3, maxWidth: 12, borderRadius: 3, backgroundColor: colors.green },
  platformHeroCard: { flexDirection: "row", alignItems: "center", gap: 12, borderColor: "#4E1C24", backgroundColor: "#12090B" },
  platformHeroArrow: { color: colors.red, fontSize: 30, fontWeight: "900" },
  platformRecordCard: { gap: 10, borderColor: "#3C2930" },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tagPayloadCard: { gap: 5, padding: 10, borderRadius: radius.md, backgroundColor: "#070A08", borderWidth: 1, borderColor: colors.border },
  tagPayloadText: { color: colors.green, fontSize: 13, fontWeight: "900" },
  tagPayloadUri: { color: colors.muted, fontSize: 8, lineHeight: 13 },
  platformIdentityCard: { gap: 9, borderColor: "#3C2930" },
  platformSecurityNote: { color: "#7B7778", fontSize: 8, lineHeight: 13 },
  platformMetricRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 10 },
  platformMetric: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  tagScannerShell: { minHeight: 340, gap: 8, borderRadius: radius.lg, overflow: "hidden" },
  tagScannerOverlay: { position: "absolute", top: 0, right: 0, bottom: 58, left: 0, alignItems: "center", justifyContent: "flex-end", paddingBottom: 18 },
  platformPlantRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  platformNotificationCard: { gap: 5 },
  platformNotificationRead: { opacity: 0.55 }
});
