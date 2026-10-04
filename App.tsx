import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { seedPlants } from "./src/data";
import { analyzePrototypeScan, scoreBand } from "./src/engine";
import { loadPlants, savePlants } from "./src/storage";
import { colors, radius } from "./src/theme";
import { Plant, ScanMode, ScanResult, Screen } from "./src/types";

const modes: Array<{ key: ScanMode; label: string }> = [
  { key: "identify", label: "IDENTIFY" },
  { key: "health", label: "HEALTH" },
  { key: "disease", label: "DISEASE" },
  { key: "leaf", label: "LEAF" },
  { key: "pest", label: "PEST" },
  { key: "soil", label: "SOIL" },
  { key: "growth", label: "GROWTH" }
];

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
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  const selectedPlant = plants.find((plant) => plant.id === selectedPlantId) ?? null;

  const openPlant = (id: string) => {
    setSelectedPlantId(id);
    setScreen("plant");
  };

  const navigate = (next: Screen) => {
    if (next !== "result") setScanResult(null);
    setScreen(next);
  };

  const runAnalysis = (uri: string) => {
    setAnalyzing(true);
    setTimeout(() => {
      const result = analyzePrototypeScan(uri, scanMode);
      setScanResult(result);
      setAnalyzing(false);
      setScreen("result");
    }, 850);
  };

  const saveScanAsPlant = () => {
    if (!scanResult) return;
    const now = new Date().toISOString();
    const plant: Plant = {
      id: "plant-" + Date.now(),
      nickname: scanResult.commonName,
      commonName: scanResult.commonName,
      scientificName: scanResult.scientificName,
      location: "Unassigned",
      healthScore: scanResult.healthScore,
      imageUri: scanResult.imageUri,
      lastScanAt: now,
      nextWaterDays: scanResult.breakdown.hydration < 75 ? 1 : 3,
      nextFeedDays: scanResult.breakdown.nutrition < 70 ? 7 : 14,
      toxicity: scanResult.toxicity,
      timeline: [
        {
          id: "event-" + Date.now(),
          type: "scan",
          label: "PlantPulse scan — " + scanResult.healthScore + "/100",
          at: now
        }
      ]
    };
    setPlants((current) => [plant, ...current]);
    setSelectedPlantId(plant.id);
    setScreen("plant");
  };

  const averageScore = Math.round(plants.reduce((sum, plant) => sum + plant.healthScore, 0) / Math.max(1, plants.length));
  const attention = plants.filter((plant) => plant.healthScore < 75);
  const dueCare = plants.filter((plant) => plant.nextWaterDays <= 1 || plant.nextFeedDays <= 1);

  const renderScreen = () => {
    if (screen === "scan") {
      return (
        <ScanScreen
          mode={scanMode}
          onMode={setScanMode}
          capturedUri={capturedUri}
          onCaptured={setCapturedUri}
          analyzing={analyzing}
          onAnalyze={runAnalysis}
        />
      );
    }

    if (screen === "result" && scanResult) {
      return <ResultScreen result={scanResult} onSave={saveScanAsPlant} onRescan={() => setScreen("scan")} />;
    }

    if (screen === "collection") {
      return <CollectionScreen plants={plants} onOpen={openPlant} />;
    }

    if (screen === "plant" && selectedPlant) {
      return <PlantScreen plant={selectedPlant} onBack={() => setScreen("collection")} />;
    }

    if (screen === "care") {
      return <CareScreen plants={plants} />;
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
  onViewPlants
}: {
  plants: Plant[];
  averageScore: number;
  attention: Plant[];
  dueCare: Plant[];
  onScan: () => void;
  onOpen: (id: string) => void;
  onViewPlants: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <DpnHeader
        eyebrow="DPN PLANTPULSE // ONLINE"
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
          <Text style={styles.statLabel}>CARE DUE</Text>
          <Text style={styles.statValue}>{dueCare.length}</Text>
          <Text style={styles.statMeta}>NEXT 24H</Text>
        </Card>
      </View>

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

      <SectionTitle title="DPN INTELLIGENCE MODULES" />
      <View style={styles.moduleGrid}>
        {[
          ["VISION", "Species + symptom analysis"],
          ["CARE", "Adaptive care scheduling"],
          ["PREDICT", "Health trend forecasting"],
          ["SENSORS", "Future moisture + light telemetry"]
        ].map(([name, description]) => (
          <Card key={name} style={styles.moduleCard}>
            <Text style={styles.moduleName}>{name}</Text>
            <Text style={styles.moduleDescription}>{description}</Text>
          </Card>
        ))}
      </View>

      <Text style={styles.prototypeNote}>v0.1 uses a local prototype analysis engine. Production botanical AI and cloud inference are intentionally not represented as complete yet.</Text>
    </ScrollView>
  );
}

function ScanScreen({
  mode,
  onMode,
  capturedUri,
  onCaptured,
  analyzing,
  onAnalyze
}: {
  mode: ScanMode;
  onMode: (mode: ScanMode) => void;
  capturedUri: string | null;
  onCaptured: (uri: string | null) => void;
  analyzing: boolean;
  onAnalyze: (uri: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [torch, setTorch] = useState(false);

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
          <Text style={styles.eyebrow}>PLANTPULSE VISION // CAMERA</Text>
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
          <Text style={styles.reticleLabel}>ALIGN PLANT WITHIN ANALYSIS FIELD</Text>
        </View>
      </View>

      {analyzing ? (
        <Card style={styles.analysisCard}>
          <ActivityIndicator color={colors.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.analysisTitle}>ANALYZING BIOLOGICAL SIGNALS</Text>
            <Text style={styles.analysisText}>Species matching • leaf stress • hydration • light • risk profile</Text>
          </View>
        </Card>
      ) : (
        <View style={styles.scanControls}>
          {capturedUri ? (
            <>
              <SecondaryButton label="RETAKE" onPress={() => onCaptured(null)} />
              <PrimaryButton label="ANALYZE PLANT" onPress={() => onAnalyze(capturedUri)} />
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

      <Text style={styles.prototypeNote}>Prototype scan results are generated locally for UI and workflow testing. Do not use v0.1 results for ingestion, toxicity, or treatment decisions.</Text>
    </View>
  );
}

function ResultScreen({ result, onSave, onRescan }: { result: ScanResult; onSave: () => void; onRescan: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.resultTop}>
        <View>
          <Text style={styles.eyebrow}>DPN PLANTPULSE // ANALYSIS COMPLETE</Text>
          <Text style={styles.resultName}>{result.commonName}</Text>
          <Text style={styles.plantLatin}>{result.scientificName}</Text>
        </View>
        <Pill label="PROTOTYPE" tone="amber" />
      </View>

      <Image source={{ uri: result.imageUri }} style={styles.resultImage} />

      <Card style={styles.scorePanel}>
        <ScoreBadge score={result.healthScore} band={result.band} />
        <View style={styles.scoreCopy}>
          <Text style={styles.scoreHeadline}>PLANTPULSE SCORE</Text>
          <Text style={styles.scoreBody}>Identification confidence preview: {result.identificationConfidence}%</Text>
          <Text style={styles.scoreBody}>Mode: {result.mode.toUpperCase()}</Text>
        </View>
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
        <PrimaryButton label="SAVE TO MY PLANTS" onPress={onSave} />
        <SecondaryButton label="SCAN AGAIN" onPress={onRescan} />
      </View>
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

function PlantScreen({ plant, onBack }: { plant: Plant; onBack: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Pressable onPress={onBack}><Text style={styles.back}>← PLANT NETWORK</Text></Pressable>
      <View style={styles.profileTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PLANT PROFILE // {plant.location.toUpperCase()}</Text>
          <Text style={styles.resultName}>{plant.nickname}</Text>
          <Text style={styles.plantLatin}>{plant.commonName} • {plant.scientificName}</Text>
        </View>
        <ScoreBadge score={plant.healthScore} band={scoreBand(plant.healthScore)} />
      </View>

      {plant.imageUri ? <Image source={{ uri: plant.imageUri }} style={styles.resultImage} /> : null}

      <View style={styles.statGrid}>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>WATER</Text>
          <Text style={styles.statValue}>{plant.nextWaterDays}</Text>
          <Text style={styles.statMeta}>DAYS</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statLabel}>FEED</Text>
          <Text style={styles.statValue}>{plant.nextFeedDays}</Text>
          <Text style={styles.statMeta}>DAYS</Text>
        </Card>
      </View>

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

      <SectionTitle title="TOXICITY PROFILE" />
      <Card style={styles.warningCard}>
        <Text style={styles.warningText}>{plant.toxicity}</Text>
      </Card>
    </ScrollView>
  );
}

function CareScreen({ plants }: { plants: Plant[] }) {
  const sorted = [...plants].sort((a, b) => a.nextWaterDays - b.nextWaterDays);
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <DpnHeader eyebrow="SMART CARE ENGINE" title="Care Command" subtitle="A single queue for watering, feeding, inspections, and future adaptive schedules." />
      <SectionTitle title="UPCOMING CARE" />
      {sorted.map((plant) => (
        <Card key={plant.id} style={styles.careCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.plantName}>{plant.nickname}</Text>
            <Text style={styles.plantLatin}>{plant.location}</Text>
          </View>
          <View style={styles.careDue}>
            <Text style={styles.careDueValue}>{plant.nextWaterDays === 0 ? "TODAY" : plant.nextWaterDays + "D"}</Text>
            <Text style={styles.careDueLabel}>WATER</Text>
          </View>
          <View style={styles.careDue}>
            <Text style={styles.careDueValue}>{plant.nextFeedDays + "D"}</Text>
            <Text style={styles.careDueLabel}>FEED</Text>
          </View>
        </Card>
      ))}
      <Card style={styles.infoCard}>
        <Text style={styles.infoTitle}>ADAPTIVE CARE ROADMAP</Text>
        <Text style={styles.infoBody}>Future scheduling will combine species requirements, scan history, user confirmations, weather context, and optional sensor telemetry instead of relying on fixed calendar reminders alone.</Text>
      </Card>
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
  careCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  careDue: { alignItems: "center", minWidth: 52 },
  careDueValue: { color: colors.green, fontWeight: "900", fontSize: 15 },
  careDueLabel: { color: colors.muted, fontWeight: "900", fontSize: 7, letterSpacing: 1 },
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
  sendButtonText: { color: "#041108", fontSize: 22, fontWeight: "900" }
});
