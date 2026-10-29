import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { ActivityStatus } from '../lib/activity';
import { brandImages, colors, Text } from './ui';

const steps = ['Sent', 'Confirming', 'Arrived'] as const;

/** Sent → Confirming → Arrived, filled in as the send's status changes. */
export function SendTracker({ status, notify }: { status: ActivityStatus; notify: boolean }) {
  const reached = status === 'confirmed' ? 3 : 1;
  return (
    <View style={{ gap: 14 }}>
      <View style={s.track}>
        <View style={s.line} />
        {steps.map((label, i) => {
          const done = i < reached;
          const now = i === reached && status === 'pending';
          return (
            <View key={label} style={s.step}>
              <View style={[s.dot, done && s.dotDone, now && s.dotNow]}>
                <Text style={[s.dotText, done && { color: '#fff' }]}>{done ? '✓' : now ? '•••' : ''}</Text>
              </View>
              <Text style={s.label}>{label}</Text>
            </View>
          );
        })}
      </View>
      {status === 'pending' && notify ? (
        <View style={s.note}>
          <Image source={brandImages.mark} style={{ width: 40, height: 40 }} contentFit="contain" />
          <Text style={s.noteText}>You can close the app. We’ll send you a notification when it arrives.</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  track: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  line: {
    position: 'absolute',
    left: 48,
    right: 48,
    top: 16,
    borderTopWidth: 3,
    borderColor: '#E6C98F',
    borderStyle: 'dotted',
  },
  step: { alignItems: 'center', width: 92, gap: 6 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: '#E6C98F',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.sky, borderColor: colors.sky },
  dotNow: { borderColor: colors.honeyBottom, backgroundColor: colors.warningBg },
  dotText: { fontSize: 14, fontWeight: '700', color: colors.warning },
  label: { fontSize: 13, fontWeight: '600' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.skyLight,
    borderRadius: 18,
    padding: 12,
  },
  noteText: { flex: 1, color: colors.skyDark, fontSize: 14, lineHeight: 20 },
});
