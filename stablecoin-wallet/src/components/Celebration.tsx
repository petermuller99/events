import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { ActivityItem } from '../lib/activity';
import { getChain, type NetworkMode } from '../lib/config';
import { itemAmount } from './money';
import { Button, colors, shortAddress, Sticker, Text } from './ui';

export interface CelebrationEvent {
  kind: 'in' | 'arrived';
  items: ActivityItem[];
}

const CONFETTI = ['#F09CA9', '#7EC4F0', '#8FD9A8', '#C9B6F2', '#FFA62B', '#FFD55B'];
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  color: CONFETTI[i % CONFETTI.length],
  x: (i * 53) % 100,
  delay: (i * 97) % 600,
  spin: i % 2 ? 1 : -1,
}));

function Confetti() {
  const { width, height } = useWindowDimensions();
  const [fall] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fall, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [fall]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {PIECES.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            s.piece,
            {
              left: (p.x / 100) * width,
              backgroundColor: p.color,
              transform: [
                { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-40 - p.delay / 4, height * 0.75] }) },
                { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin * 540}deg`] }) },
              ],
              opacity: fall.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

function texts(mode: NetworkMode, event: CelebrationEvent) {
  const [first] = event.items;
  const chain = getChain(mode, first.chain).name;
  if (event.kind === 'in') {
    if (event.items.length > 1) {
      return { title: 'Money in!', amount: `${event.items.length} payments`, detail: 'See them in Activity' };
    }
    const from = first.counterparty ? `from ${shortAddress(first.counterparty)} on ${chain}` : `on ${chain}`;
    return { title: 'Money in!', amount: `+${itemAmount(first)} ${first.symbol}`, detail: from };
  }
  const to = first.counterparty ? `reached ${shortAddress(first.counterparty)} on ${chain}` : `on ${chain}`;
  return { title: 'It arrived!', amount: `${itemAmount(first)} ${first.symbol}`, detail: to };
}

/** A short, happy full-screen moment: confetti, a bouncing Pearl and a gentle buzz. */
export function Celebration({
  mode,
  event,
  onClose,
}: {
  mode: NetworkMode;
  event: CelebrationEvent | null;
  onClose: () => void;
}) {
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!event) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [event, pop]);

  if (!event) return null;
  const t = texts(mode, event);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient colors={['#FFE79A', colors.bg]} locations={[0, 0.6]} style={s.screen}>
        <Confetti />
        <Animated.View
          style={{ transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}
        >
          <Sticker name={event.kind === 'in' ? 'wheee' : 'laugh'} size={200} />
        </Animated.View>
        <Text style={s.title}>{t.title}</Text>
        <Text style={s.amount} adjustsFontSizeToFit numberOfLines={1}>
          {t.amount}
        </Text>
        <Text style={s.detail}>{t.detail}</Text>
        <Button title="Yay!" onPress={onClose} style={s.button} />
      </LinearGradient>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  piece: { position: 'absolute', top: 0, width: 10, height: 16, borderRadius: 3 },
  title: { fontSize: 32, fontWeight: '700', marginTop: 8 },
  amount: { fontSize: 40, fontWeight: '700' },
  detail: { fontSize: 16, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 40 },
});
