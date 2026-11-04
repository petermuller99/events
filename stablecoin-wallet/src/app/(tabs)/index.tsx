import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityItem } from '../../lib/activity';
import { goalPercent, loadGoal, type SavingsGoal } from '../../lib/goal';
import { AppState, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowUp, Chevron } from '../../components/icons';
import { ChangeLabel, LineChart, RangeTabs } from '../../components/Chart';
import { ListCard, ListRow, TokenBadge } from '../../components/money';
import { Banner, brandImages, colors, honeyGradient, Screen, Sticker, Text } from '../../components/ui';
import { formatAmount, formatDollars } from '../../lib/amount';
import { isStableAssetId, type ChainId } from '../../lib/config';
import { allFound, FOUND_MIN_USD, loadFound, scanFound } from '../../lib/found';
import { portfolioSeries, type Holding } from '../../lib/portfolio';
import {
  change24h,
  coinValue18,
  fetchCoinPrices,
  fetchNativePrices,
  fetchPriceHistory,
  nativeValue,
  RANGES,
  type CoinPrice,
  type NativePrices,
  type PricePoint,
  type Range,
} from '../../lib/prices';
import { checkForUpdate, type UpdateInfo } from '../../lib/updates';
import { fetchAllBalances, isStable, type ChainBalances } from '../../lib/wallet';
import { useActivity } from '../../state/ActivityContext';
import { useTips } from '../../state/TipsContext';
import { useUnlockedWallet } from '../../state/WalletContext';

const LAUGH = require('../../../assets/brand/stickers/laugh.png');

/** Stablecoins received today, scaled to 18 decimals. */
function receivedToday(items: ActivityItem[]): bigint {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return items
    .filter((i) => i.direction === 'in' && isStableAssetId(i.assetId) && i.status === 'confirmed' && i.timestamp >= start.getTime())
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

interface Prices {
  native: NativePrices;
  /** Found coins, by CoinGecko id. */
  coins: Record<string, CoinPrice>;
}

/**
 * Dollar value of one coin, scaled to 18 decimals so coins can be added up. Stablecoins
 * count as $1; fee coins (BTC, ETH, BNB, CORE, SOL) and found coins use the current
 * price, or null without one.
 */
function coinValue(row: ChainBalances, asset: ChainBalances['assets'][number]['asset'], balance: bigint, prices: Prices): bigint | null {
  if (asset.found) {
    const p = prices.coins[asset.found.coingeckoId];
    return p ? coinValue18(balance, asset.decimals, p.usd) : null;
  }
  if (asset.contract) return balance * 10n ** BigInt(18 - asset.decimals);
  const price = prices.native[row.chain.id];
  return price == null ? null : nativeValue(balance, asset.decimals, price);
}

const MIN_FOUND_18 = BigInt(Math.round(FOUND_MIN_USD * 1e6)) * 10n ** 12n;

/** A found coin is only listed (and counted) while it's worth at least the minimum. */
function counts(asset: ChainBalances['assets'][number]['asset'], value: bigint | null): boolean {
  return !asset.found || (value != null && value >= MIN_FOUND_18);
}

/** Most valuable first, e.g. $100 USDT before $20 SOL; coins without a price go last. */
function byValue(a: { value: bigint | null }, b: { value: bigint | null }): number {
  if (a.value == null || b.value == null) return Number(a.value == null) - Number(b.value == null);
  return a.value === b.value ? 0 : a.value > b.value ? -1 : 1;
}

/** Sum of all coins' dollar values. */
function totalValue(rows: ChainBalances[], prices: Prices): bigint {
  let total = 0n;
  for (const row of rows) {
    for (const { asset, balance } of row.assets) {
      const value = coinValue(row, asset, balance, prices);
      if (counts(asset, value)) total += value ?? 0n;
    }
  }
  return total;
}

type Coin = ChainBalances['assets'][number] & { chain: ChainBalances['chain']; value: bigint | null };

function CoinRow({ coin, prices, last }: { coin: Coin; prices: Prices; last: boolean }) {
  const { asset, balance, chain, value } = coin;
  const change = asset.found ? prices.coins[asset.found.coingeckoId]?.change24h : !asset.contract ? change24h(chain.id) : undefined;
  return (
    <ListRow
      last={last}
      left={<TokenBadge symbol={asset.symbol} chain={chain.id} native={!asset.contract} found={!!asset.found} />}
      title={asset.symbol}
      subtitle={isStable(asset) ? chain.name : `${formatAmount(balance, asset.decimals, 4)} ${asset.symbol} · ${chain.name}`}
      right={
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.coinAmount}>
            {value == null ? `${formatAmount(balance, asset.decimals, 4)} ${asset.symbol}` : `$${formatDollars(value, 18)}`}
          </Text>
          {change != null ? (
            <Text style={[s.coinChange, { color: change >= 0 ? colors.success : colors.pinkDark }]}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
            </Text>
          ) : null}
        </View>
      }
      onPress={() => router.push({ pathname: '/coin', params: { chain: chain.id, asset: asset.id } })}
    />
  );
}

export default function Home() {
  const { keys, mode, hasScreenLock } = useUnlockedWallet();
  const activity = useActivity();
  const tips = useTips();
  const [rows, setRows] = useState<ChainBalances[] | null>(null);
  const [prices, setPrices] = useState<Prices>({ native: {}, coins: {} });
  const [refreshing, setRefreshing] = useState(false);
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [range, setRange] = useState<Range>('1W');
  const [history, setHistory] = useState<{ key: string; data: Partial<Record<ChainId, PricePoint[]>> } | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  /** When balances were last loaded: the chart ends there. */
  const [loadedAt, setLoadedAt] = useState(0);
  const request = useRef(0);

  // Look again whenever Home is shown or the app comes back to the front (cached for a
  // few minutes), so a check from Settings or a new release shows up straight away.
  useFocusEffect(
    useCallback(() => {
      checkForUpdate().then(setUpdate);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdate().then(setUpdate);
    });
    return () => sub.remove();
  }, []);

  const load = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    await loadFound();
    const [result, latestPrices] = await Promise.all([fetchAllBalances(mode, keys), fetchNativePrices()]);
    const ids = [...new Set(result.flatMap((r) => r.assets.flatMap((a) => (a.asset.found ? [a.asset.found.coingeckoId] : []))))];
    const coinPrices = ids.length ? await fetchCoinPrices(ids) : {};
    // Ignore a slow response from before a network switch.
    if (id === request.current) {
      setRows(result);
      setPrices({ native: latestPrices, coins: coinPrices });
      setLoadedAt(Date.now());
      setRefreshing(false);
    }
  }, [mode, keys]);

  // Look for coins that arrived in the wallet by themselves (real money, every few hours).
  const scanning = useRef(false);
  const scan = useCallback(
    async (force = false) => {
      if (mode !== 'mainnet' || scanning.current) return;
      scanning.current = true;
      try {
        if (await scanFound({ evm: keys.evm.address, solana: keys.solana.address }, force)) load();
      } catch {
        // Try again next time.
      } finally {
        scanning.current = false;
      }
    },
    [mode, keys, load],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      loadGoal().then(setGoal);
      scan();
    }, [load, scan]),
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
    scan(true);
  };

  const total = rows ? totalValue(rows, prices) : 0n;
  const dollars = Number(total / 10n ** 16n) / 100;
  const percent = goal ? goalPercent(goal, dollars) : 0;
  const allCoins = (
    rows?.flatMap((r) => r.assets.map((a) => ({ ...a, chain: r.chain, value: coinValue(r, a.asset, a.balance, prices) }))) ??
    []
  )
    .filter((c) => counts(c.asset, c.value))
    .sort(byValue);
  const coins = allCoins.filter((c) => !c.asset.found);
  const foundCoins = allCoins.filter((c) => c.asset.found);
  const foundTotal = foundCoins.reduce((sum, c) => sum + (c.value ?? 0n), 0n);
  const hiddenCount = mode === 'mainnet' ? allFound().length - foundCoins.length : 0;
  const failed = rows?.filter((r) => r.error) ?? [];

  // Price history only for the fee coins actually held, to keep requests down.
  const heldNative = (rows ?? [])
    .filter((r) => r.assets.some((a) => !a.asset.contract && a.balance > 0n))
    .map((r) => r.chain.id);
  const historyKey = `${range}:${heldNative.join(',')}`;
  useEffect(() => {
    let current = true;
    Promise.all(heldNative.map((c) => fetchPriceHistory(c, range).then((p) => [c, p] as const, () => null))).then(
      (res) => {
        if (current) setHistory({ key: historyKey, data: Object.fromEntries(res.filter((r) => r != null)) });
      },
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  const series = useMemo(() => {
    if (!rows) return [];
    const holdings: Holding[] = rows.flatMap((r) =>
      r.assets
        .filter(({ asset, balance }) => counts(asset, coinValue(r, asset, balance, prices)))
        .map(({ asset, balance }) => ({
          chain: r.chain.id,
          assetId: asset.id,
          decimals: asset.decimals,
          balance,
          stable: isStable(asset),
          priceKey: asset.found?.coingeckoId,
        })),
    );
    const now = loadedAt;
    const current: Record<string, number> = {
      ...Object.fromEntries(Object.entries(prices.native).map(([c, p]) => [c, Number(p) / 1e6])),
      ...Object.fromEntries(Object.entries(prices.coins).map(([id, p]) => [id, p.usd])),
    };
    const data = history?.key === historyKey ? history.data : {};
    return portfolioSeries(holdings, activity.items, data, current, now - RANGES[range] * 86_400_000, now);
  }, [rows, prices, history, historyKey, activity.items, range, loadedAt]);
  const growth = series.length > 1 ? series[series.length - 1].usd - series[0].usd : 0;

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

      {update ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(update.url)}
          style={({ pressed }) => [s.update, pressed && { opacity: 0.8 }]}
        >
          <Text style={{ fontSize: 24 }}>🎁</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.updateTitle}>New version available</Text>
            <Text style={s.muted}>Build {update.build} · tap to download</Text>
          </View>
          <View style={s.updateButton}>
            <Text style={s.updateButtonText}>Update</Text>
          </View>
        </Pressable>
      ) : null}

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
            {foundTotal > 0n ? <Text style={s.foundNote}>includes ${formatDollars(foundTotal, 18)} in found coins</Text> : null}
            {rows && total > 0n ? (
              <>
                <ChangeLabel change={growth} range={range} />
                <LineChart values={series.map((p) => p.usd)} height={70} />
                <RangeTabs value={range} onChange={setRange} dark />
              </>
            ) : null}
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

      {tips.today ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Today's tip: ${tips.today.title}. See all tip cards`}
          onPress={() => router.push('/tips')}
          style={({ pressed }) => [s.tip, pressed && { transform: [{ translateY: 2 }], borderBottomWidth: 3 }]}
        >
          <Text style={s.tipEmoji}>{tips.today.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.tipLabel}>Today’s tip</Text>
            <Text style={s.tipTitle} numberOfLines={1}>
              {tips.today.title}
            </Text>
            <Text style={s.tipCount}>⭐ {tips.state.collected.length} / 10 collected · tap to see all</Text>
          </View>
          <Chevron color={colors.text} />
        </Pressable>
      ) : null}

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
          coins.map((c, i) => <CoinRow key={`${c.chain.id}:${c.asset.id}`} coin={c} prices={prices} last={i === coins.length - 1} />)
        )}
      </ListCard>
      {foundCoins.length ? (
        <>
          <View style={s.foundHeader}>
            <Text style={s.section}>Found in Pearl’s wallet</Text>
            <View style={s.autoTag}>
              <Text style={s.autoTagText}>AUTO</Text>
            </View>
          </View>
          <ListCard>
            {foundCoins.map((c, i) => (
              <CoinRow key={`${c.chain.id}:${c.asset.id}`} coin={c} prices={prices} last={i === foundCoins.length - 1} />
            ))}
          </ListCard>
        </>
      ) : null}
      {hiddenCount > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/found')} style={({ pressed }) => [s.hidden, pressed && { opacity: 0.7 }]}>
          <Text style={[s.muted, { flex: 1 }]}>
            🙈 {hiddenCount} {hiddenCount === 1 ? 'coin' : 'coins'} hidden: worth too little or looked like a scam
          </Text>
          <Chevron color={colors.muted} />
        </Pressable>
      ) : null}
      {failed.map((r) => (
        <Banner key={r.chain.id} tone="danger" sticker="hmm">
          Couldn’t reach {r.chain.name}. Pull down to try again.
        </Banner>
      ))}
      {coins.some((c) => !c.asset.contract && c.value == null && c.balance > 0n) ? (
        <Text style={s.fee}>Couldn’t get today’s prices, so BTC, ETH, BNB, CORE and SOL aren’t in your total yet.</Text>
      ) : null}
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
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ECE4FB',
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: colors.text,
    borderBottomWidth: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  tipEmoji: { fontSize: 34, lineHeight: 42 },
  tipLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  tipTitle: { fontSize: 16, fontWeight: '700' },
  tipCount: { fontSize: 12.5, fontWeight: '600', color: '#5A3A1A' },
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
  coinChange: { fontSize: 12, fontWeight: '600' },
  update: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.skyLight,
    borderColor: colors.sky,
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  updateTitle: { fontSize: 15, fontWeight: '700' },
  updateButton: { backgroundColor: colors.text, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  updateButtonText: { color: colors.honey, fontWeight: '700', fontSize: 14 },
  fee: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  foundNote: { fontSize: 13, fontWeight: '600', opacity: 0.8, marginRight: 96 },
  foundHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  autoTag: { backgroundColor: colors.skyLight, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginTop: 6 },
  autoTagText: { fontSize: 11, fontWeight: '700', color: colors.skyDark },
  hidden: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3DC',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
