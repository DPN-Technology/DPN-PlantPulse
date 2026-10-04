import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { BrandHeader } from '../components/BrandHeader';
import { HealthGauge } from '../components/HealthGauge';
import { analyzePlantImage } from '../services/plantIntelligence';
import { ScanMode, ScanResult } from '../types/plant';
import { colors, radius, spacing } from '../theme';

const modes: ScanMode[] = ['FULL HEALTH', 'IDENTIFY', 'DISEASE', 'LEAF', 'PEST', 'GROWTH'];

export function ScanScreen({ onOpenResult }: { onOpenResult: (result: ScanResult) => void }) {
  const [mode, setMode] = useState<ScanMode>('FULL HEALTH');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Frame one plant clearly. Good lighting improves confidence.');

  async function process(uri: string) {
    setBusy(true);
    setResult(null);
    setMessage('Analyzing biological structure, leaf signals, stress patterns and species match…');
    try {
      const next = await analyzePlantImage(uri, mode);
      setResult(next);
      setMessage('Prototype analysis complete.');
    } catch {
      setMessage('The scan could not be analyzed. Try another image.');
    } finally {
      setBusy(false);
    }
  }

  async function useCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage('Camera permission is required to scan a live plant.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false });
    if (!picked.canceled && picked.assets[0]?.uri) await process(picked.assets[0].uri);
  }

  async function useLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage('Photo-library permission is required to analyze an existing image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: false });
    if (!picked.canceled && picked.assets[0]?.uri) await process(picked.assets[0].uri);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader eyebrow="DPN PLANT INTELLIGENCE // SCANNER" />
      <View style={styles.reticle}>
        {result ? <Image source={{ uri: result.imageUri }} style={styles.image} /> : <View style={styles.target}><Text style={styles.targetText}>PLANTPULSE{'
'}VISION CORE</Text></View>}
        <View style={styles.cornerTL} /><View style={styles.cornerTR} /><View style={styles.cornerBL} /><View style={styles.cornerBR} />
        <View style={styles.scanLine} />
      </View>
      <Text style={styles.message}>{message}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modes}>
        {modes.map(item => (
          <Pressable key={item} onPress={() => setMode(item)} style={[styles.mode, mode === item && styles.modeActive]}>
            <Text style={[styles.modeText, mode === item && styles.modeTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable onPress={useCamera} style={styles.primary}><Text style={styles.primaryText}>SCAN WITH CAMERA</Text></Pressable>
        <Pressable onPress={useLibrary} style={styles.secondary}><Text style={styles.secondaryText}>USE PHOTO LIBRARY</Text></Pressable>
      </View>

      {busy && <View style={styles.analysis}><ActivityIndicator color={colors.green} /><Text style={styles.analysisText}>PLANT INTELLIGENCE ENGINE RUNNING</Text></View>}

      {result && (
        <View style={styles.resultCard}>
          <HealthGauge score={result.plant.healthScore} compact />
          <View style={styles.resultCopy}>
            <Text style={styles.resultEyebrow}>MATCH {result.plant.confidence}%</Text>
            <Text style={styles.resultTitle}>{result.plant.commonName}</Text>
            <Text style={styles.resultScientific}>{result.plant.scientificName}</Text>
            <Text style={styles.resultSummary}>{result.summary}</Text>
          </View>
          <Pressable onPress={() => onOpenResult(result)} style={styles.open}><Text style={styles.openText}>OPEN PLANT INTELLIGENCE RECORD</Text></Pressable>
        </View>
      )}
      <Text style={styles.disclaimer}>PlantPulse currently uses a local prototype analysis engine. Production computer-vision and knowledge services will replace this placeholder without changing the scan workflow.</Text>
    </ScrollView>
  );
}

const corner = { position: 'absolute' as const, width: 34, height: 34, borderColor: colors.green };
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 120 },
  reticle: { height: 330, backgroundColor: '#030805', borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: '#23412F', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%', resizeMode: 'cover', opacity: .78 },
  target: { width: 164, height: 164, borderRadius: 90, borderWidth: 1, borderColor: '#284C35', alignItems: 'center', justifyContent: 'center' },
  targetText: { color: '#416C50', textAlign: 'center', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, lineHeight: 18 },
  cornerTL: { ...corner, top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { ...corner, top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { ...corner, bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { ...corner, bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3 },
  scanLine: { position: 'absolute', left: 30, right: 30, top: '50%', height: 1, backgroundColor: colors.red, shadowColor: colors.red, shadowRadius: 10, shadowOpacity: 1 },
  message: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 10 },
  modes: { gap: 8, paddingVertical: 16 },
  mode: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  modeActive: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  modeText: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  modeTextActive: { color: colors.green },
  actions: { gap: 10 },
  primary: { backgroundColor: colors.red, borderRadius: radius.md, padding: 15 },
  primaryText: { textAlign: 'center', color: colors.white, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  secondary: { backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 15 },
  secondaryText: { textAlign: 'center', color: colors.text, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  analysis: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, marginTop: 14, backgroundColor: colors.panel, borderRadius: radius.md },
  analysisText: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  resultCard: { marginTop: 16, borderWidth: 1, borderColor: '#315741', backgroundColor: colors.panelElevated, borderRadius: radius.lg, padding: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  resultCopy: { flex: 1, minWidth: 180 },
  resultEyebrow: { color: colors.green, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  resultTitle: { color: colors.white, fontSize: 19, fontWeight: '900', marginTop: 4 },
  resultScientific: { color: colors.muted, fontSize: 11, fontStyle: 'italic' },
  resultSummary: { color: colors.text, fontSize: 11, lineHeight: 17, marginTop: 8 },
  open: { width: '100%', backgroundColor: colors.greenSoft, borderWidth: 1, borderColor: colors.green, padding: 12, borderRadius: radius.sm },
  openText: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: .8, textAlign: 'center' },
  disclaimer: { color: '#587064', fontSize: 9, lineHeight: 14, marginTop: 16 }
});
