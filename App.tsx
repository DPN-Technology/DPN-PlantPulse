import React, { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CollectionScreen } from './src/screens/CollectionScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { InsightsScreen } from './src/screens/InsightsScreen';
import { PlantProfileScreen } from './src/screens/PlantProfileScreen';
import { ScanScreen } from './src/screens/ScanScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PlantRecord, ScanResult } from './src/types/plant';
import { colors } from './src/theme';

type Tab = 'HOME' | 'SCAN' | 'PLANTS' | 'INSIGHTS' | 'SYSTEM';

export default function App() {
  const [tab, setTab] = useState<Tab>('HOME');
  const [selectedPlant, setSelectedPlant] = useState<PlantRecord | null>(null);

  function openPlant(plant: PlantRecord) {
    setSelectedPlant(plant);
  }

  function openScanResult(result: ScanResult) {
    setSelectedPlant(result.plant);
  }

  let content: React.ReactNode;
  if (selectedPlant) {
    content = <PlantProfileScreen plant={selectedPlant} onBack={() => setSelectedPlant(null)} />;
  } else if (tab === 'HOME') {
    content = <HomeScreen onScan={() => setTab('SCAN')} onOpenPlant={openPlant} />;
  } else if (tab === 'SCAN') {
    content = <ScanScreen onOpenResult={openScanResult} />;
  } else if (tab === 'PLANTS') {
    content = <CollectionScreen onOpenPlant={openPlant} />;
  } else if (tab === 'INSIGHTS') {
    content = <InsightsScreen />;
  } else {
    content = <SettingsScreen />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.app}>{content}</View>
      {!selectedPlant && <BottomNav active={tab} onChange={setTab} />}
    </SafeAreaView>
  );
}

function BottomNav({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: Tab[] = ['HOME', 'SCAN', 'PLANTS', 'INSIGHTS', 'SYSTEM'];
  return (
    <View style={styles.nav}>
      {tabs.map(tab => {
        const selected = tab === active;
        const isScan = tab === 'SCAN';
        return (
          <Pressable key={tab} onPress={() => onChange(tab)} style={[styles.navItem, isScan && styles.scanNav]}>
            <View style={[styles.navGlyph, selected && styles.navGlyphActive, isScan && styles.scanGlyph]}>
              <Text style={[styles.glyphText, selected && styles.glyphTextActive]}>{tab.slice(0, 1)}</Text>
            </View>
            <Text style={[styles.navText, selected && styles.navTextActive]}>{tab}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1 },
  nav: { position: 'absolute', left: 12, right: 12, bottom: 12, height: 72, borderRadius: 22, backgroundColor: '#09100CFA', borderWidth: 1, borderColor: '#25382D', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 4, shadowColor: '#000', shadowOpacity: .5, shadowRadius: 12, elevation: 12 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  scanNav: { marginTop: -17 },
  navGlyph: { width: 27, height: 27, borderRadius: 14, backgroundColor: '#111A15', borderWidth: 1, borderColor: '#26392E', alignItems: 'center', justifyContent: 'center' },
  navGlyphActive: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  scanGlyph: { width: 42, height: 42, borderRadius: 22, borderColor: colors.red, backgroundColor: '#23080D' },
  glyphText: { color: colors.muted, fontWeight: '900', fontSize: 10 },
  glyphTextActive: { color: colors.green },
  navText: { color: '#698075', fontSize: 7, letterSpacing: .5, fontWeight: '800' },
  navTextActive: { color: colors.text }
});
