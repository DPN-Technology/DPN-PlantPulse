import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getHealthBand } from '../services/plantIntelligence';
import { colors } from '../theme';

export function HealthGauge({ score, compact = false }: { score: number; compact?: boolean }) {
  const band = getHealthBand(score);
  const tone = score >= 75 ? colors.green : score >= 60 ? colors.amber : colors.red;
  const size = compact ? 86 : 132;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: tone }]}>
      <View style={styles.inner}>
        <Text style={[styles.score, compact && styles.scoreCompact]}>{score}</Text>
        <Text style={[styles.band, { color: tone }]}>{band}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 7, justifyContent: 'center', alignItems: 'center', backgroundColor: '#07100B', shadowColor: colors.green, shadowOpacity: .2, shadowRadius: 18, elevation: 8 },
  inner: { alignItems: 'center' },
  score: { color: colors.white, fontSize: 42, lineHeight: 46, fontWeight: '900' },
  scoreCompact: { fontSize: 27, lineHeight: 31 },
  band: { fontSize: 8, letterSpacing: 1.1, fontWeight: '900' }
});
