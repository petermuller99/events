import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '../../lib/activity';
import { goalPercent, loadGoal, type SavingsGoal } from '../../lib/goal';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowUp } from '../../components/icons';
import { ListCard, ListRow, TokenBadge } from '../../components/money';
import { Banner, brandImages, colors, honeyGradient, Screen, Sticker, Text } from '../../components/ui';
import { formatAmount, formatDollars } from '../../lib/amount';
import { fetchAllBalances, type ChainBalances } from '../../lib/wallet';
import { useActivity } from '../../state/ActivityContext';
import { useUnlockedWallet } from '../../state/WalletContext';

const LAUGH = require('../../../assets/brand/stickers/laugh.png');

/** Stablecoins received today, scaled to 18 decimals. */
function receivedToday(items: ActivityItem[]): bigint {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return items
    .filter((i) => i.direction === 'in' && i.assetId !== 'native' && i.status === 'confirmed' && i.timestamp >= start.getTime())
    .reduce((sum, i) => sum + BigInt(i.amount) * 10n ** BigInt(18 - i.decimals), 0n);
}

/** Pearl's one-line hello on the home screen. */
function greeting(items: ActivityItem[], total: bigint | null): string {
  const today = receivedToday(items);
  if (today > 0n) return `Yay, you got $${formatDollars(today, 18)} today! 🎉`;
  if (items.some((i) => i.status === 'pending')) return 'Your money is on its way…';
  if (total === 0n) return 'Hi! Tap Receive to add your first dollars.';
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning! ☀️' : hour < 18 ? 'Good afternoon! 🌼' : 'Good evening! 🌙';
}

/** Sum of all stablecoin balances, scaled to 18 decimals so chains can be added up. */
function totalStablecoins(rows: ChainBalances[]): bigint {
  let total = 0n;
  for (const row of rows) {
    for (const { asset, balance } of row.assets) {
      if (asset.contract) total += balance * 10n ** BigInt(18 - asset.decimals);
    }
  }
  return total;
}

export default function Home() {
  const { keys, mode, hasScreenLock } = useUnlockedWallet();
  const activity = useActivity();
  const [rows, setRows] = useState<ChainBalances[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    const result = await fetchAllBalances(mode, keys);
    // Ignore a slow response from before a network switch.
    if (id === request.current) {
      setRows(result);
      setRefreshing(false);
    }
  }, [mode, keys]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadGoal().then(setGoal);
    }, [load]),
  );

  // New activity means balances changed: reload them.
  const activityKey = activity.items.map((i) => `${i.id}:${i.status}`).join('|');
  const lastKey = useRef(activityKey);
  useEffect(() => {
    if (lastKey.current === activityKey) return;
    lastKey.current = activityKey;
    load();
  }, [activityKey, load]);

  const refresh = () => {
    load();
    activity.refresh();
  };

  const total = rows ? totalStablecoins(rows) : 0n;
  const dollars = Number(total / 10n ** 16n) / 100;
  const percent = goal ? goalPercent(goal, dollars) : 0;
  const coins = rows?.flatMap((r) => r.assets.filter((a) => a.asset.contract).map((a) => ({ ...a, chain: r.chain }))) ?? [];
  const feeCoins = rows
    ?.flatMap((r) => r.assets.filter((a) => !a.asset.contract))
    .map(({ asset, balance }) => `${formatAmount(balance, asset.decimals, 4)} ${asset.symbol}`)
    .join(' · ');
  const failed = rows?.filter((r) => r.error) ?? [];

  return (
    <Screen tab refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={s.header}>
        <View style={s.avatar}>
          <Image source={LAUGH} style={s.avatarImage} contentFit="cover" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.appName}>Pearl Wallet</Text>
          <Text style={[s.mode, mode === 'mainnet' && { color: colors.pinkDark }]}>
            {mode === 'testnet' ? 'Test money' : 'Real money'}
          </Text>
        </View>
      </View>
      <View style={s.bubble}>
        <View style={s.bubbleTip} />
        <Text style={s.bubbleText}>{greeting(activity.items, rows ? total : null)}</Text>
      </View>

      {!hasScreenLock ? (
        <Banner tone="warning">
          This phone has no screen lock, so anyone holding it can open Pearl Wallet. Set a passcode in your phone’s
          settings.
        </Banner>
      ) : null}

      <View style={s.balanceWrap}>
        <View style={s.balanceShadow}>
          <LinearGradient colors={honeyGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.balance}>
            <Text style={s.balanceLabel}>My money</Text>
            <Text style={s.balanceAmount} adjustsFontSizeToFit numberOfLines={1}>
              {rows ? `$${formatDollars(total, 18)}` : '…'}
            </Text>
            {goal ? (
              <Pressable onPress={() => router.push('/goal')} accessibilityRole="button" style={{ gap: 4 }}>
                <Text style={s.goalText} numberOfLines={1}>
                  Saving for: {goal.name} · ${goal.target.toLocaleString()}
                </Text>
                <View style={s.goalBar}>
                  <View style={[s.goalFill, { width: `${percent}%` }]} />
                  <Text style={s.goalPercent}>{percent >= 100 ? 'Done! 🎉' : `${percent}%`}</Text>
                </View>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/goal')} accessibilityRole="button" hitSlop={8}>
                <Text style={s.goalLink}>+ Set a savings goal</Text>
              </Pressable>
            )}
          </LinearGradient>
        </View>
        <Image source={brandImages.mark} style={s.balanceSticker} contentFit="contain" />
      </View>

      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/send')}
          style={({ pressed }) => [s.action, s.send, pressed && s.pressed]}
        >
          <View style={s.actionIcon}>
            <ArrowUp color={colors.pinkDark} size={24} />
          </View>
          <Text style={s.actionText}>Send</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/receive')}
          style={({ pressed }) => [s.action, s.receive, pressed && s.pressed]}
        >
          <View style={s.actionIcon}>
            <ArrowDown color={colors.skyDark} size={24} />
          </View>
          <Text style={s.actionText}>Receive</Text>
        </Pressable>
      </View>

      {rows && total === 0n && failed.length === 0 ? (
        <View style={s.empty}>
          <Sticker name="curious" size={96} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.emptyTitle}>Nothing here yet</Text>
            <Text style={s.muted}>Tap Receive to get your address and add some money.</Text>
          </View>
        </View>
      ) : null}

      <Text style={s.section}>My coins</Text>
      <ListCard>
        {coins.length === 0 ? (
          <ListRow title={rows ? 'No coins to show' : 'Loading…'} last />
        ) : (
          coins.map(({ asset, balance, chain }, i) => (
            <ListRow
              key={`${chain.id}:${asset.id}`}
              last={i === coins.length - 1}
              left={<TokenBadge symbol={asset.symbol} chain={chain.id} />}
              title={asset.symbol}
              subtitle={chain.name}
              right={<Text style={s.coinAmount}>${formatDollars(balance, asset.decimals)}</Text>}
              onPress={() => router.push({ pathname: '/send', params: { chain: chain.id, asset: asset.id } })}
            />
          ))
        )}
      </ListCard>
      {failed.map((r) => (
        <Banner key={r.chain.id} tone="danger" sticker="hmm">
          Couldn’t reach {r.chain.name}. Pull down to try again.
        </Banner>
      ))}
      {feeCoins ? <Text style={s.fee}>Fee coins: {feeCoins}</Text> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: colors.skyLight,
    borderWidth: 2,
    borderColor: colors.border,
  },
  avatarImage: { width: 62, height: 62, marginLeft: -4, marginTop: 4 },
  appName: { fontSize: 21, fontWeight: '700' },
  mode: { fontSize: 13, fontWeight: '600', color: colors.skyDark },
  bubble: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 6,
  },
  bubbleTip: {
    position: 'absolute',
    top: -10,
    left: 22,
    width: 16,
    height: 16,
    backgroundColor: colors.card,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  bubbleText: { fontSize: 16, fontWeight: '600' },
  balanceWrap: { marginTop: 22 },
  balanceShadow: { borderRadius: 28, backgroundColor: colors.honeyShadow, paddingBottom: 6 },
  balance: { borderRadius: 28, padding: 18, gap: 4 },
  balanceLabel: { fontSize: 16, fontWeight: '600', opacity: 0.85 },
  balanceAmount: { fontSize: 44, fontWeight: '700', letterSpacing: -1, marginRight: 96 },
  goalText: { fontSize: 13, fontWeight: '600' },
  goalBar: {
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2,
    borderColor: colors.honeyShadow,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  goalFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#fff' },
  goalPercent: { position: 'absolute', right: 8, fontSize: 12, fontWeight: '700' },
  goalLink: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline', marginTop: 2 },
  balanceSticker: { position: 'absolute', right: 8, top: -26, width: 100, height: 100 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  action: { flex: 1, borderRadius: 24, paddingVertical: 14, alignItems: 'center', gap: 6, borderBottomWidth: 5 },
  send: { backgroundColor: colors.pinkLight, borderBottomColor: '#F2BCC6' },
  receive: { backgroundColor: colors.skyLight, borderBottomColor: '#BFE0F7' },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 3 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 17, fontWeight: '600' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  section: { fontSize: 19, fontWeight: '700', marginTop: 6 },
  coinAmount: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  fee: { fontSize: 13, color: colors.muted, textAlign: 'center' },
});
