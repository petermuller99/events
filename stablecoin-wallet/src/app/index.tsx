import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Banner, Body, Button, Card, chainColors, Chips, colors, Screen, shortAddress } from '../components/ui';
import { formatAmount } from '../lib/amount';
import type { NetworkMode } from '../lib/config';
import { fetchAllBalances, type ChainBalances } from '../lib/wallet';
import { useUnlockedWallet } from '../state/WalletContext';

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
  const { keys, mode, setMode, hasScreenLock } = useUnlockedWallet();
  const [rows, setRows] = useState<ChainBalances[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
    }, [load]),
  );

  const changeMode = (next: NetworkMode) => {
    if (next === mode) return;
    if (next === 'testnet') {
      setRows(null);
      setMode(next);
      return;
    }
    Alert.alert('Switch to mainnet?', 'Mainnet uses real money. Transactions cannot be reversed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Use mainnet',
        style: 'destructive',
        onPress: () => {
          setRows(null);
          setMode('mainnet');
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontSize: 16 }}>Settings</Text>
            </Pressable>
          ),
        }}
      />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Chips
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'testnet', label: 'Testnet' },
            { value: 'mainnet', label: 'Mainnet' },
          ]}
        />
        {mode === 'testnet' ? (
          <Banner tone="info">Test networks: these tokens have no value. Use the faucet links on Receive.</Banner>
        ) : (
          <Banner tone="danger">Mainnet: real funds. Double-check every address before sending.</Banner>
        )}
        {!hasScreenLock ? (
          <Banner tone="warning">
            This phone has no screen lock, so anyone holding it can open this wallet. Set a passcode in
            your phone’s settings.
          </Banner>
        ) : null}

        <Card>
          <Body muted>Total stablecoins</Body>
          <Text style={s.total}>{rows ? `$${formatAmount(totalStablecoins(rows), 18, 2)}` : '…'}</Text>
        </Card>

        {rows?.map((row) => <ChainCard key={row.chain.id} row={row} onRetry={load} />)}
      </Screen>
    </>
  );
}

function ChainCard({ row, onRetry }: { row: ChainBalances; onRetry: () => void }) {
  const { chain } = row;
  return (
    <Card>
      <View style={s.chainHeader}>
        <View style={[s.dot, { backgroundColor: chainColors[chain.id] }]} />
        <Text style={s.chainName}>{chain.name}</Text>
        <Text style={s.badge}>{chain.standard}</Text>
      </View>
      <Text style={s.address}>{shortAddress(row.address)}</Text>
      {row.error ? (
        <>
          <Banner tone="danger">Couldn’t load balances: {row.error}</Banner>
          <Button title="Retry" variant="secondary" onPress={onRetry} />
        </>
      ) : (
        row.assets.map(({ asset, balance }) => (
          <Pressable
            key={asset.id}
            style={s.assetRow}
            onPress={() => router.push({ pathname: '/send', params: { chain: chain.id, asset: asset.id } })}
          >
            <Text style={[s.assetSymbol, !asset.contract && { color: colors.muted }]}>
              {asset.symbol}
              {!asset.contract ? ' (for fees)' : ''}
            </Text>
            <Text style={s.assetBalance}>{formatAmount(balance, asset.decimals)}</Text>
          </Pressable>
        ))
      )}
      <View style={s.actions}>
        <Button
          title="Receive"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/receive', params: { chain: chain.id } })}
        />
        <Button
          title="Send"
          style={{ flex: 1 }}
          disabled={!!row.error}
          onPress={() => router.push({ pathname: '/send', params: { chain: chain.id } })}
        />
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  total: { fontSize: 32, fontWeight: '700', color: colors.text },
  chainHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chainName: { fontSize: 17, fontWeight: '700', color: colors.text, flex: 1 },
  badge: {
    fontSize: 12,
    color: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  address: { fontFamily: 'monospace', color: colors.muted, fontSize: 13 },
  assetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  assetSymbol: { fontSize: 16, color: colors.text, fontWeight: '600' },
  assetBalance: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
