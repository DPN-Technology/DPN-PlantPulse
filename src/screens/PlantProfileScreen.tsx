import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HealthGauge } from '../components/HealthGauge';
import { PlantRecord } from '../types/plant';
import { colors, radius, spacing } from '../theme';

export function PlantProfileScreen({ plant, onBack }: { plant: PlantRecord; onBack: () => void }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK TO PLANT NETWORK</Text></Pressable>
      <View style={styles.header}>
        <HealthGauge score={plant.healthScore} />
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>PLANT INTELLIGENCE RECORD</Text>
          <Text style={styles.title}>{plant.nickname}</Text>
          <Text style={styles.scientific}>{plant.scientificName}</Text>
          <Text style={styles.location}>{plant.location} • ID confidence {plant.confidence}%</Text>
        </View>
      </View>

      <Text style={styles.section}>HEALTH SIGNALS</Text>
      <View style={styles.signalGrid}>
        {plant.signals.map(signal => <View key={signal.label} style={styles.signal}><Text style={styles.signalLabel}>{signal.label}</Text><Text style={[styles.signalValue, { color: signal.state === 'good' ? colors.green : signal.state === 'watch' ? colors.amber : colors.red }]}>{signal.value}</Text></View>)}
      </View>

      <View style={styles.warning}>
        <Text style={styles.warningTitle}>TOXICITY / SAFETY</Text>
        <Text style={styles.warningText}>{plant.toxicity}</Text>
        <Text style={styles.warningFine}>Confirm uncertain identifications with a qualified source before making ingestion or treatment decisions.</Text>
      </View>

      <Text style={styles.section}>PLANT TIMELINE</Text>
      {plant.timeline.map((event, index) => (
        <View key={event.date + index} style={styles.timelineRow}>
          <View style={styles.timelineRail}><View style={styles.timelineDot} /></View>
          <View style={styles.timelineCopy}>
            <Text style={styles.date}>{event.date}</Text>
            <Text style={styles.eventTitle}>{event.title}{event.score ? ' // ' + event.score : ''}</Text>
            <Text style={styles.eventDetail}>{event.detail}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  back: { color: colors.red, fontWeight: '900', letterSpacing: 1, fontSize: 9, marginBottom: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 18, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.panel },
  titleBlock: { flex: 1 },
  eyebrow: { color: colors.green, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.white, fontSize: 23, lineHeight: 27, fontWeight: '900', marginTop: 6 },
  scientific: { color: colors.muted, fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  location: { color: '#6E8779', fontSize: 9, marginTop: 9 },
  section: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginTop: 24, marginBottom: 9 },
  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  signal: { width: '48%', backgroundColor: colors.panelElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
  signalLabel: { color: colors.muted, fontSize: 8, letterSpacing: .7 },
  signalValue: { fontSize: 14, fontWeight: '900', marginTop: 5 },
  warning: { backgroundColor: '#180B0E', borderLeftWidth: 3, borderLeftColor: colors.red, borderRadius: radius.sm, padding: 14, marginTop: 16 },
  warningTitle: { color: colors.red, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  warningText: { color: colors.text, fontSize: 12, lineHeight: 17, marginTop: 6 },
  warningFine: { color: colors.muted, fontSize: 9, lineHeight: 14, marginTop: 6 },
  timelineRow: { flexDirection: 'row', minHeight: 72 },
  timelineRail: { width: 20, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#294536', marginLeft: 6 },
  timelineDot: { width: 9, height: 9, borderRadius: 9, backgroundColor: colors.green, marginLeft: -1 },
  timelineCopy: { flex: 1, paddingLeft: 10, paddingBottom: 17 },
  date: { color: colors.green, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  eventTitle: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 3 },
  eventDetail: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }
});
