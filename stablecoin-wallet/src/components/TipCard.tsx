import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { TIPS, type Tip } from '../lib/tips';
import { colors, Sticker, Text } from './ui';

// Pearl's money tips: a chunky, outlined "game card" look that's deliberately more
// playful than the rest of the app.

export const OUTLINE = colors.text;

/** Ten little stars, filled in for collected tips. */
export function StarRow({ collected, size = 22 }: { collected: number[]; size?: number }) {
  return (
    <View style={s.stars}>
      {TIPS.map((t) => {
        const on = collected.includes(t.id);
        return (
          <View
            key={t.id}
            style={[
              s.star,
              { width: size, height: size, borderRadius: size / 2 },
              on ? s.starOn : s.starOff,
            ]}
          >
            <Text style={[s.starText, { fontSize: size * 0.55 }, !on && { color: '#C9B58F' }]}>★</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Chunky outlined button with a hard shadow, like a game button. */
export function GameButton({ title, onPress, color = '#8FD9A8' }: { title: string; onPress: () => void; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: color }, pressed && s.buttonPressed]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}

/**
 * The pop-up tip card. "new" shows a freshly unlocked tip with "Got it! +1 ⭐";
 * "review" re-reads a collected tip from the collection.
 */
export function TipCardModal({
  tip,
  kind,
  collected,
  onClose,
}: {
  tip: Tip | null;
  kind: 'new' | 'review' | 'master';
  collected: number[];
  onClose: () => void;
}) {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!tip && kind !== 'master') return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
  }, [tip, kind, pop]);

  if (!tip && kind !== 'master') return null;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.dim}>
        <Animated.View style={[s.card, { transform: [{ scale }] }]}>
          {kind === 'master' ? (
            <>
              <Text style={s.ribbon}>Money Master!</Text>
              <Sticker name="wheee" size={150} />
              <Text style={s.emoji}>👑</Text>
              <Text style={s.title}>You collected all 10!</Text>
              <Text style={s.text}>Pearl crowns you a Money Master. Keep saving, sharing and asking smart questions!</Text>
              <GameButton title="Yay! 🎉" onPress={onClose} color={colors.honey} />
            </>
          ) : tip ? (
            <>
              <Text style={s.ribbon}>Pearl’s Money Tip #{tip.id}</Text>
              <Sticker name={tip.sticker} size={120} />
              <Text style={s.emoji}>{tip.emoji}</Text>
              <Text style={s.title}>{tip.title}</Text>
              <Text style={s.text}>{tip.text}</Text>
              <GameButton
                title={kind === 'new' && !collected.includes(tip.id) ? 'Got it! +1 ⭐' : 'Got it!'}
                onPress={onClose}
              />
              <StarRow collected={collected} />
              <Text style={s.count}>
                {collected.length} of {TIPS.length} tips collected
              </Text>
            </>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(59,34,9,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 30,
    borderWidth: 3,
    borderColor: OUTLINE,
    borderBottomWidth: 9,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 6,
  },
  ribbon: {
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: colors.honey,
    borderWidth: 2.5,
    borderColor: OUTLINE,
    borderBottomWidth: 5,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  emoji: { fontSize: 56, lineHeight: 64 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  text: { fontSize: 16, fontWeight: '500', lineHeight: 23, textAlign: 'center', color: '#5A3A1A' },
  count: { fontSize: 13, fontWeight: '600', color: colors.muted },
  button: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: OUTLINE,
    borderBottomWidth: 6,
    marginTop: 10,
  },
  buttonPressed: { borderBottomWidth: 3, transform: [{ translateY: 3 }] },
  buttonText: { fontSize: 18, fontWeight: '700' },
  stars: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  star: { alignItems: 'center', justifyContent: 'center' },
  starOn: { backgroundColor: colors.honey, borderWidth: 2, borderColor: OUTLINE },
  starOff: { backgroundColor: '#F3E6CC' },
  starText: { fontWeight: '700', lineHeight: undefined },
});
