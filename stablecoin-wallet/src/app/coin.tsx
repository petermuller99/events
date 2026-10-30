import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChangeLabel, LineChart, RangeTabs } from '../components/Chart';
import { ArrowDown, ArrowUp } from '../components/icons';
import { ActivityRow, ListCard, TokenBadge } from '../components/money';
import { colors, Screen, Text } from '../components/ui';
import { formatAmount, formatDollars } from '../lib/amount';
import { CHAIN_IDS, getChain, type ChainId } from '../lib/config';
import {
  fetchNativePrices,
  fetchPriceHistory,
  nativeValue,
  type NativePrices,
  type PricePoint,
  type Range,
} from '../lib/prices';
import { fetchChainBalances, findAsset, listAssets, type AssetId } from '../lib/wallet';
import { useActivity } from '../state/ActivityContext';
import { useUnlockedWallet } from '../state/WalletContext';

const LINE_COLORS: Record<string, string> = {
  USDT: '#26A17B',
  USDC: '#2775CA',
  ethereum: '#627EEA',
  bsc: '#E0A800',
  solana: '#14B87A',
};

/** One coin: what you hold, its price chart, Send/Receive and its recent activity. */
export default function Coin() {
  const params = useLocalSearchParams<{ chain?: string; asset?: string }>();
  const { keys, mode } = useUnlockedWallet();
  const activity = useActivity();
  const chainId = CHAIN_IDS.includes(params.chain as ChainId) ? (params.chain as ChainId) : 'ethereum';
  const chain = getChain(mode, chainId);
  const asset = findAsset(mode, chainId, params.asset as AssetId) ?? listAssets(mode, chainId)[0];
  const stable = !!asset.contract;

  const [balance, setBalance] = useState<bigint | null>(null);
  const [prices, setPrices] = useState<NativePrices>({});
  const [range, setRange] = useState<Range>('1W');
  const [history, setHistory] = useState<{ range: Range; points: PricePoint[] | 'error' } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([fetchChainBalances(mode, keys, chainId), fetchNativePrices()]).then(([b, p]) => {
      if (!current) return;
      setBalance(b.assets.find((a) => a.asset.id === asset.id)?.balance ?? 0n);
      setPrices(p);
    });
    return () => {
      current = false;
    };
  }, [mode, keys, chainId, asset.id]);

  useEffect(() => {
    if (stable) return;
    let current = true;
    fetchPriceHistory(chainId, range).then(
      (points) => current && setHistory({ range, points }),
      () => current && setHistory({ range, points: 'error' }),
    );
    return () => {
      current = false;
    };
  }, [stable, chainId, range]);

  const price = prices[chainId];
  const value =
    balance == null
      ? null
      : stable
        ? balance * 10n ** BigInt(18 - asset.decimals)
        : price != null
          ? nativeValue(balance, asset.decimals, price)
          : null;
  const points = history?.range === range ? history.points : null;
  const loaded = Array.isArray(points) && points.length > 1 ? points : null;
  const held = balance != null ? Number(balance) / 10 ** asset.decimals : 0;
  const change = loaded ? held * (loaded[loaded.length - 1][1] - loaded[0][1]) : 0;
  const percent = loaded ? (loaded[loaded.length - 1][1] / loaded[0][1] - 1) * 100 : undefined;
  const color = LINE_COLORS[stable ? asset.symbol : chainId] ?? colors.text;
  const recent = activity.items.filter((i) => i.chain === chainId && i.assetId === asset.id).slice(0, 5);

  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <View style={s.header}>
        <TokenBadge symbol={asset.symbol} chain={chainId} native={!stable} size={44} />
        <View>
          <Text style={s.symbol}>{asset.symbol}</Text>
          <Text style={s.muted}>{chain.name}</Text>
        </View>
      </View>

      <View>
        <Text style={s.muted}>You have</Text>
        <Text style={s.value} adjustsFontSizeToFit numberOfLines={1}>
          {value != null ? `$${formatDollars(value, 18)}` : balance == null ? '…' : `${formatAmount(balance, asset.decimals, 6)}`}
        </Text>
        {balance != null ? (
          <Text style={s.amount}>
            {formatAmount(balance, asset.decimals, stable ? 2 : 6, stable ? 2 : 0)} {asset.symbol}
          </Text>
        ) : null}
      </View>

      {stable ? (
        <View style={s.stablePill}>
          <Text style={s.stablePillText}>≈ $1.00 always</Text>
        </View>
      ) : loaded ? (
        <ChangeLabel change={change} percent={percent} range={range} />
      ) : null}

      {stable ? (
        <LineChart values={[1, 1]} flat color={color} />
      ) : loaded ? (
        <LineChart values={loaded.map((p) => p[1])} color={color} />
      ) : (
        <View style={s.chartEmpty}>
          <Text style={s.muted}>{points === 'error' ? 'Couldn’t load prices. Try again later.' : 'Loading prices…'}</Text>
        </View>
      )}
      {stable ? null : <RangeTabs value={range} onChange={setRange} />}
      {!stable && price != null ? (
        <Text style={s.muted}>
          1 {asset.symbol} = ${(Number(price) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </Text>
      ) : null}

      {stable ? (
        <View style={s.note}>
          <Text style={s.noteText}>
            🐝 {asset.symbol} is a stable dollar: 1 {asset.symbol} is always worth about $1, so your savings don’t go up
            and down.
          </Text>
        </View>
      ) : null}

      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/send', params: { chain: chainId, asset: asset.id } })}
          style={({ pressed }) => [s.action, s.send, pressed && s.pressed]}
        >
          <ArrowUp color={colors.pinkDark} size={20} />
          <Text style={s.actionText}>Send</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/receive', params: { chain: chainId } })}
          style={({ pressed }) => [s.action, s.receive, pressed && s.pressed]}
        >
          <ArrowDown color={colors.skyDark} size={20} />
          <Text style={s.actionText}>Receive</Text>
        </Pressable>
      </View>

      {recent.length ? (
        <>
          <Text style={s.section}>Recent</Text>
          <ListCard>
            {recent.map((item, i) => (
              <ActivityRow
                key={item.id}
                item={item}
                mode={mode}
                last={i === recent.length - 1}
                onPress={() => router.push({ pathname: '/tx', params: { id: item.id } })}
              />
            ))}
          </ListCard>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  symbol: { fontSize: 22, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.muted },
  value: { fontSize: 44, fontWeight: '700', letterSpacing: -1 },
  amount: { fontSize: 15, color: colors.muted },
  stablePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stablePillText: { fontSize: 13, fontWeight: '600' },
  chartEmpty: { height: 140, alignItems: 'center', justifyContent: 'center' },
  note: { backgroundColor: '#DDF5E5', borderRadius: 18, padding: 12 },
  noteText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  action: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    paddingVertical: 14,
    borderBottomWidth: 4,
  },
  send: { backgroundColor: colors.pinkLight, borderBottomColor: '#F2BCC6' },
  receive: { backgroundColor: colors.skyLight, borderBottomColor: '#BFE0F7' },
  pressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
  actionText: { fontSize: 17, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '700' },
});
