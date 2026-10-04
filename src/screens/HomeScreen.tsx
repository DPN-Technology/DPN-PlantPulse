import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { HealthGauge } from '../components/HealthGauge';
import { demoPlants } from '../data/demoPlants';
import { PlantRecord } from '../types/plant';
import { colors, radius, spacing } from '../theme';

export function HomeScreen({ onScan, onOpenPlant }: { onScan: () => void; onOpenPlant: (plant: PlantRecord) => void }) {
  const primary = demoPlants[0];
  if (!primary) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader />
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>PLANT NETWORK STATUS</Text>
          <Text style={styles.heroTitle}>Your living collection, under watch.</Text>
          <Text style={styles.heroBody}>Scan, understand, act, remember and predict—with every plant building its own health history.</Text>
          <Pressable onPress={onScan} style={styles.scanButton}>
            <Text style={styles.scanButtonText}>BEGIN INTELLIGENCE SCAN</Text>
          </Pressable>
        </View>
        <HealthGauge score={primary.healthScore} compact />
      </View>

      <View style={styles.statGrid}>
        <Metric label="PLANTS" value="3" />
        <Metric label="HEALTHY" value="2" tone={colors.green} />
        <Metric label="WATCH" value="1" tone={colors.amber} />
      </View>

      <Text style={styles.section}>PRIORITY PLANT</Text>
      <Pressable style={styles.plantCard} onPress={() => onOpenPlant(primary)}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nickname}>{primary.nickname}</Text>
            <Text style={styles.scientific}>{primary.scientificName}</Text>
          </View>
          <Text style={styles.score}>{primary.healthScore}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.signalRow}>
          <Signal label="NEXT WATER" value={primary.nextWatering} />
          <Signal label="LAST SCAN" value={primary.lastScan} />
          <Signal label="ID CONF." value={primary.confidence + '%'} />
        </View>
      </Pressable>

      <View style={styles.alert}>
        <Text style={styles.alertTitle}>PREDICTIVE WATCH</Text>
        <Text style={styles.alertText}>Bedroom Palm is trending downward. Hydration stress is the strongest current signal.</Text>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value, tone = colors.text }: { label: string; value: string; tone?: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color: tone }]}>{value}</Text></View>;
}

function Signal({ label, value }: { label: string; value: string }) {
  return <View style={styles.signal}><Text style={styles.signalLabel}>{label}</Text><Text style={styles.signalValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 120 },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 18, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  heroCopy: { flex: 1 },
  kicker: { color: colors.green, fontSize: 9, letterSpacing: 1.4, fontWeight: '900' },
  heroTitle: { color: colors.white, fontWeight: '900', fontSize: 22, lineHeight: 25, marginTop: 8 },
  heroBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  scanButton: { backgroundColor: colors.red, borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 12, marginTop: 14 },
  scanButtonText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: .7, textAlign: 'center' },
  statGrid: { flexDirection: 'row', gap: 10, marginTop: 12 },
  metric: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.panel, padding: 12 },
  metricLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  metricValue: { marginTop: 4, fontSize: 23, fontWeight: '900' },
  section: { color: colors.muted, fontSize: 9, letterSpacing: 1.4, fontWeight: '900', marginTop: 24, marginBottom: 8 },
  plantCard: { borderWidth: 1, borderColor: '#315741', borderRadius: radius.lg, backgroundColor: colors.panelElevated, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  nickname: { color: colors.white, fontSize: 17, fontWeight: '900' },
  scientific: { color: colors.muted, fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  score: { color: colors.green, fontSize: 33, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  signalRow: { flexDirection: 'row', gap: 8 },
  signal: { flex: 1 },
  signalLabel: { color: colors.muted, fontSize: 7, letterSpacing: .8 },
  signalValue: { color: colors.text, fontSize: 11, fontWeight: '800', marginTop: 4 },
  alert: { marginTop: 14, borderLeftWidth: 3, borderLeftColor: colors.amber, backgroundColor: '#17130B', padding: 14, borderRadius: 10 },
  alertTitle: { color: colors.amber, fontSize: 9, letterSpacing: 1.2, fontWeight: '900' },
  alertText: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 6 }
});
