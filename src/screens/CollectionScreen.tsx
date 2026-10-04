import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandHeader } from '../components/BrandHeader';
import { demoPlants } from '../data/demoPlants';
import { PlantRecord } from '../types/plant';
import { colors, radius, spacing } from '../theme';

export function CollectionScreen({ onOpenPlant }: { onOpenPlant: (plant: PlantRecord) => void }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader eyebrow="DPN PLANT INTELLIGENCE // COLLECTION" />
      <Text style={styles.heading}>MY PLANT NETWORK</Text>
      <Text style={styles.sub}>3 registered plants • 2 healthy • 1 requires attention</Text>
      {demoPlants.map(plant => (
        <Pressable key={plant.id} onPress={() => onOpenPlant(plant)} style={styles.card}>
          <View style={styles.scoreBlock}><Text style={[styles.score, { color: plant.healthScore >= 75 ? colors.green : colors.amber }]}>{plant.healthScore}</Text><Text style={styles.scoreLabel}>PULSE</Text></View>
          <View style={styles.copy}>
            <Text style={styles.name}>{plant.nickname}</Text>
            <Text style={styles.scientific}>{plant.scientificName}</Text>
            <Text style={styles.meta}>{plant.location}  •  Last scan: {plant.lastScan}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 120 },
  heading: { color: colors.white, fontSize: 24, fontWeight: '900' },
  sub: { color: colors.muted, fontSize: 11, marginTop: 5, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, marginBottom: 10 },
  scoreBlock: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#07100B', borderWidth: 1, borderColor: '#315741', alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 22, fontWeight: '900' },
  scoreLabel: { color: colors.muted, fontSize: 7, letterSpacing: 1 },
  copy: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: '900' },
  scientific: { color: colors.muted, fontSize: 10, fontStyle: 'italic', marginTop: 2 },
  meta: { color: '#70857A', fontSize: 9, marginTop: 7 },
  chevron: { color: colors.red, fontSize: 30, fontWeight: '300' }
});
