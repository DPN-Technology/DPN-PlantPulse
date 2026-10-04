import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { colors, radius, spacing } from '../theme';

export function SettingsScreen() {
  const rows = [
    ['Plant Intelligence Engine', 'Prototype Local'],
    ['Cloud Sync', 'Planned'],
    ['DPN Identity', 'Planned'],
    ['Care Notifications', 'Planned'],
    ['Sensor Bridge', 'Planned'],
    ['Data Export', 'Planned']
  ];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader eyebrow="DPN PLANTPULSE // SYSTEM" />
      <Text style={styles.heading}>SYSTEM CONTROL</Text>
      <Text style={styles.sub}>PlantPulse v0.1 mobile foundation</Text>
      <View style={styles.panel}>
        {rows.map(([label, value], index) => <View key={label} style={[styles.row, index > 0 && styles.rowBorder]}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>)}
      </View>
      <View style={styles.note}><Text style={styles.noteTitle}>PRIVACY PRINCIPLE</Text><Text style={styles.noteText}>Plant images and health history should be treated as user-owned data. Production cloud features will require explicit retention, deletion and export controls.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 120 },
  heading: { color: colors.white, fontSize: 24, fontWeight: '900' },
  sub: { color: colors.muted, fontSize: 11, marginTop: 4 },
  panel: { marginTop: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14 },
  row: { paddingVertical: 15, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  label: { color: colors.text, fontSize: 11, fontWeight: '700', flex: 1 },
  value: { color: colors.green, fontSize: 10, fontWeight: '900' },
  note: { marginTop: 14, borderLeftWidth: 3, borderLeftColor: colors.red, backgroundColor: '#17090C', padding: 14, borderRadius: radius.sm },
  noteTitle: { color: colors.red, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  noteText: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 6 }
});
