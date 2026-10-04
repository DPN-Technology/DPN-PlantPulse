import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function BrandHeader({ eyebrow = 'DPN BIOLOGICAL INTELLIGENCE NETWORK' }: { eyebrow?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.brandRow}>
        <View style={styles.mark}>
          <Text style={styles.markText}>DPN</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>PLANT<Text style={styles.green}>PULSE</Text></Text>
        </View>
        <View style={styles.online}>
          <View style={styles.dot} />
          <Text style={styles.onlineText}>ONLINE</Text>
        </View>
      </View>
      <Text style={styles.binary}>01010000 01001100 01000001 01001110 01010100 // DEVELOP • PIONEER • NAVIGATE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { borderWidth: 1, borderColor: colors.red, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: '#170609' },
  markText: { color: colors.white, fontWeight: '900', letterSpacing: 1.5, fontSize: 12 },
  copy: { flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 9, letterSpacing: 1.35, fontWeight: '700' },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: 1.8 },
  green: { color: colors.green },
  online: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 7, backgroundColor: colors.green },
  onlineText: { color: colors.green, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  binary: { color: '#294536', fontSize: 8, marginTop: 8, letterSpacing: .4 }
});
