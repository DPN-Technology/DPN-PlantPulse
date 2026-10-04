import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { colors, radius, spacing } from '../theme';

export function InsightsScreen() {
  const bars = [48, 54, 59, 67, 72, 79, 88, 92];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader eyebrow="DPN PREDICTIVE PLANT INTELLIGENCE" />
      <Text style={styles.heading}>HEALTH INTELLIGENCE</Text>
      <Text style={styles.sub}>Longitudinal health becomes more useful than a one-time identification.</Text>
      <View style={styles.chart}>
        <View style={styles.chartHeader}><Text style={styles.chartTitle}>LIVING ROOM MONSTERA</Text><Text style={styles.delta}>+5 pts</Text></View>
        <View style={styles.bars}>{bars.map((height, i) => <View key={i} style={[styles.bar, { height }]} />)}</View>
        <Text style={styles.caption}>PlantPulse Score trend // prototype data</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardKicker}>PREDICTIVE WATCH</Text>
        <Text style={styles.cardTitle}>Bedroom Palm may decline further without a care change.</Text>
        <Text style={styles.cardBody}>Current prototype signals point toward hydration stress. Production prediction will require repeated observations, care history, environment and confidence-aware models.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardKicker}>FUTURE SENSOR FUSION</Text>
        <Text style={styles.cardTitle}>Image intelligence + environmental telemetry.</Text>
        <Text style={styles.cardBody}>Roadmap inputs: soil moisture, ambient light, humidity, temperature, EC and pH. Sensor values should strengthen—not replace—visual and historical context.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 120 },
  heading: { color: colors.white, fontSize: 24, fontWeight: '900' },
  sub: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  chart: { marginTop: 18, padding: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  chartTitle: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  delta: { color: colors.green, fontSize: 10, fontWeight: '900' },
  bars: { height: 110, flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 18 },
  bar: { flex: 1, backgroundColor: colors.green, borderTopLeftRadius: 4, borderTopRightRadius: 4, opacity: .78 },
  caption: { color: colors.muted, fontSize: 8, marginTop: 9 },
  card: { marginTop: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.panelElevated, borderWidth: 1, borderColor: colors.border },
  cardKicker: { color: colors.red, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  cardTitle: { color: colors.white, fontSize: 17, fontWeight: '900', lineHeight: 21, marginTop: 6 },
  cardBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 7 }
});
