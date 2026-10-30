import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { RANGES, type Range } from '../lib/prices';
import { colors, Text } from './ui';

/** A smooth-enough line chart with a soft fill under it. Values are plotted left to right. */
export function LineChart({
  values,
  height = 140,
  color = colors.text,
  flat,
}: {
  values: number[];
  height?: number;
  color?: string;
  /** Draw a flat line in the middle, e.g. for a stablecoin that stays at $1. */
  flat?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const pad = 4;
  let line = '';
  let area = '';
  if (width > 0 && values.length > 1) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [
      pad + (i * (width - 2 * pad)) / (values.length - 1),
      flat || max === min ? height / 2 : pad + (height - 2 * pad) * (1 - (v - min) / span),
    ]);
    line = 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
    area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  }
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {line ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#fill)" />
          <Path d={line} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : (
        <Svg width={width} height={height}>
          <Line x1={pad} x2={Math.max(pad, width - pad)} y1={height / 2} y2={height / 2} stroke={colors.border} strokeWidth={2} strokeDasharray="6 6" />
        </Svg>
      )}
    </View>
  );
}

/** 1D / 1W / 1M / 1Y pills. */
export function RangeTabs({ value, onChange, dark }: { value: Range; onChange: (r: Range) => void; dark?: boolean }) {
  return (
    <View style={s.tabs}>
      {(Object.keys(RANGES) as Range[]).map((r) => {
        const on = r === value;
        return (
          <Pressable
            key={r}
            onPress={() => onChange(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            hitSlop={6}
            style={[s.tab, dark ? s.tabOnHoney : s.tabPlain, on && s.tabOn]}
          >
            <Text style={[s.tabText, on && s.tabTextOn]}>{r}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const RANGE_WORDS: Record<Range, string> = { '1D': 'today', '1W': 'this week', '1M': 'this month', '1Y': 'this year' };

/** "▲ $12.40 this week" in green, or "▼ …" in pink. */
export function ChangeLabel({ change, percent, range }: { change: number; percent?: number; range: Range }) {
  const up = change >= 0;
  const amount = Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = percent != null && Number.isFinite(percent) ? ` (${Math.abs(percent).toFixed(1)}%)` : '';
  return (
    <Text style={[s.change, { color: up ? colors.success : colors.pinkDark }]}>
      {up ? '▲' : '▼'} ${amount}
      {pct} <Text style={s.changeWhen}>{RANGE_WORDS[range]}</Text>
    </Text>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999 },
  tabPlain: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border },
  tabOnHoney: { backgroundColor: 'rgba(255,255,255,0.6)' },
  tabOn: { backgroundColor: colors.text, borderColor: colors.text },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: colors.honey },
  change: { fontSize: 14, fontWeight: '700' },
  changeWhen: { fontSize: 13, fontWeight: '500', color: colors.muted },
});
