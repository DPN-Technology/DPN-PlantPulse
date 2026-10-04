import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { colors, radius } from "./theme";
import { HealthBand, Screen } from "./types";

export function DpnHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Pill({ label, tone = "green" }: { label: string; tone?: "green" | "red" | "amber" | "muted" }) {
  const toneStyle =
    tone === "red" ? styles.pillRed :
    tone === "amber" ? styles.pillAmber :
    tone === "muted" ? styles.pillMuted :
    styles.pillGreen;

  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export function ScoreBadge({ score, band }: { score: number; band: HealthBand }) {
  const danger = score < 60;
  const fair = score >= 60 && score < 75;
  return (
    <View style={[styles.scoreBadge, danger && styles.scoreDanger, fair && styles.scoreFair]}>
      <Text style={styles.scoreValue}>{score}</Text>
      <Text style={styles.scoreBand}>{band}</Text>
    </View>
  );
}

export function MetricBar({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const normalized = Math.max(0, Math.min(100, inverse ? 100 - value : value));
  return (
    <View style={styles.metricWrap}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: normalized + "%" }]} />
      </View>
    </View>
  );
}

const nav: Array<{ key: Screen; label: string; icon: string }> = [
  { key: "home", label: "Home", icon: "⌂" },
  { key: "scan", label: "Scan", icon: "◎" },
  { key: "collection", label: "Plants", icon: "♧" },
  { key: "care", label: "Care", icon: "✓" },
  { key: "ai", label: "AI", icon: "✦" }
];

export function BottomNav({ screen, onChange }: { screen: Screen; onChange: (screen: Screen) => void }) {
  return (
    <View style={styles.nav}>
      {nav.map((item) => {
        const active = screen === item.key || (item.key === "collection" && screen === "plant");
        return (
          <Pressable key={item.key} style={styles.navItem} onPress={() => onChange(item.key)}>
            <Text style={[styles.navIcon, active && styles.navActive]}>{item.icon}</Text>
            <Text style={[styles.navLabel, active && styles.navActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 18 },
  eyebrow: { color: colors.green, fontSize: 11, fontWeight: "900", letterSpacing: 2.2 },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, maxWidth: 520 },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 16
  },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  pillGreen: { backgroundColor: colors.greenSoft, borderColor: "#276841" },
  pillRed: { backgroundColor: "#371119", borderColor: "#7A2030" },
  pillAmber: { backgroundColor: "#362A0D", borderColor: "#765C18" },
  pillMuted: { backgroundColor: "#151A18", borderColor: colors.border },
  pillText: { color: colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  scoreBadge: {
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 7,
    borderColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#08100B"
  },
  scoreDanger: { borderColor: colors.red },
  scoreFair: { borderColor: colors.amber },
  scoreValue: { color: colors.text, fontSize: 30, fontWeight: "900" },
  scoreBand: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  metricWrap: { gap: 7 },
  metricTop: { flexDirection: "row", justifyContent: "space-between" },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  metricValue: { color: colors.text, fontSize: 12, fontWeight: "900" },
  track: { height: 7, backgroundColor: "#172019", borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.green, borderRadius: radius.pill },
  nav: {
    minHeight: 72,
    backgroundColor: "#070B09",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 8
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  navIcon: { color: colors.muted, fontSize: 20, fontWeight: "900" },
  navLabel: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  navActive: { color: colors.green }
});
