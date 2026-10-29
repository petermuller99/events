import { router, useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { activityAmount, itemAmount } from '../components/money';
import { Button, colors, Row, Screen, shortAddress, shortHash, Sticker, Text, type StickerName } from '../components/ui';
import type { ActivityItem } from '../lib/activity';
import { getChain } from '../lib/config';
import { useActivity } from '../state/ActivityContext';
import { useUnlockedWallet } from '../state/WalletContext';

function headline(item: ActivityItem): { title: string; sticker: StickerName } {
  const amount = `${itemAmount(item)} ${item.symbol}`;
  if (item.direction === 'in') return { title: `You got ${amount}!`, sticker: 'wheee' };
  if (item.status === 'pending') return { title: `Sending ${amount}…`, sticker: 'curious' };
  if (item.status === 'failed') return { title: 'This send didn’t go through', sticker: 'hmm' };
  return { title: `You sent ${amount}`, sticker: 'laugh' };
}

const statusText = { pending: 'On its way…', confirmed: 'Arrived ✓', failed: 'Didn’t go through' } as const;

export default function TransactionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mode } = useUnlockedWallet();
  const { items } = useActivity();
  const item = items.find((i) => i.id === id);

  if (!item) {
    return (
      <Screen>
        <Text style={s.title}>Not found</Text>
        <Button title="Close" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const chain = getChain(mode, item.chain);
  const { title, sticker } = headline(item);
  return (
    <Screen>
      <View style={s.hero}>
        <Sticker name={sticker} size={130} />
        <Text style={s.title}>{title}</Text>
        <Text style={s.muted}>
          {new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </Text>
      </View>
      <View style={s.rows}>
        <Row label="Amount" value={`${activityAmount(item)} ${item.symbol}`} />
        {item.counterparty ? (
          <Row label={item.direction === 'in' ? 'From' : 'To'} value={shortAddress(item.counterparty)} mono />
        ) : null}
        <Row label="Network" value={`${chain.name} (${item.assetId === 'native' ? 'fee coin' : chain.standard})`} />
        <Row label="Status" value={statusText[item.status]} />
        {item.hash ? <Row label="Transaction" value={shortHash(item.hash)} mono /> : null}
      </View>
      {item.status === 'failed' && item.direction === 'out' ? (
        <Text style={s.muted}>That money is still in your wallet. Only the network fee may have been used.</Text>
      ) : null}
      {item.hash ? (
        <Button
          title={`View on ${chain.explorerName}`}
          variant="secondary"
          onPress={() => Linking.openURL(chain.explorerTxUrl(item.hash))}
        />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', gap: 2 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  muted: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  rows: {
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
  },
});
