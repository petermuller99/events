import { Pressable, StyleSheet, View } from 'react-native';
import { OUTLINE, StarRow } from '../components/TipCard';
import { colors, Screen, Sticker, Text } from '../components/ui';
import { isMoneyMaster, TIPS } from '../lib/tips';
import { useTips } from '../state/TipsContext';

export default function TipCards() {
  const { state, openTip } = useTips();
  const master = isMoneyMaster(state);
  return (
    <Screen>
      <View style={s.header}>
        <Sticker name="wheee" size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.headerTitle}>
            {state.collected.length} of {TIPS.length} collected
          </Text>
          <StarRow collected={state.collected} size={20} />
          <Text style={s.headerText}>
            {master ? 'You’re a Money Master! 👑' : 'Collect all 10 to become a Money Master 👑'}
          </Text>
        </View>
      </View>

      <View style={s.grid}>
        {TIPS.map((tip) => {
          const got = state.collected.includes(tip.id);
          return got ? (
            <Pressable
              key={tip.id}
              accessibilityRole="button"
              accessibilityLabel={`Tip ${tip.id}: ${tip.title}`}
              onPress={() => openTip(tip)}
              style={({ pressed }) => [s.card, { backgroundColor: tip.color }, pressed && s.pressed]}
            >
              <Text style={s.cardEmoji}>{tip.emoji}</Text>
              <Text style={s.cardText}>{tip.short}</Text>
            </Pressable>
          ) : (
            <View key={tip.id} style={[s.card, s.locked]} accessibilityLabel={`Tip ${tip.id}, not collected yet`}>
              <Text style={s.cardEmoji}>❓</Text>
              <Text style={[s.cardText, { color: '#9C8A6A' }]}>Tip {tip.id}</Text>
            </View>
          );
        })}
      </View>
      <Text style={s.note}>A new tip pops up each time you unlock Pearl Wallet.</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFE7AE',
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: OUTLINE,
    borderBottomWidth: 6,
    padding: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerText: { fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '31.5%',
    minHeight: 108,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: OUTLINE,
    borderBottomWidth: 6,
    padding: 8,
    gap: 4,
  },
  pressed: { borderBottomWidth: 3, transform: [{ translateY: 3 }] },
  locked: { backgroundColor: '#EFE6D2', borderColor: '#CDBB98' },
  cardEmoji: { fontSize: 32, lineHeight: 40 },
  cardText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
