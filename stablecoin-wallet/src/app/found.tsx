import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch } from 'react-native';
import { ListCard, ListRow, TokenBadge } from '../components/money';
import { Banner, Button, colors, LinkButton, Screen, shortAddress, Text } from '../components/ui';
import { getChain } from '../lib/config';
import {
  allFound,
  foundEnabled,
  FOUND_MIN_USD,
  HIDDEN_REASON_TEXT,
  loadFound,
  scanFound,
  setFoundEnabled,
  setHiddenByYou,
  type FoundCoin,
} from '../lib/found';
import { errorMessage } from '../lib/wallet';
import { useUnlockedWallet } from '../state/WalletContext';

/** Settings → Found coins: the switch, and the coins kept hidden with the reason why. */
export default function Found() {
  const { keys, mode } = useUnlockedWallet();
  const [coins, setCoins] = useState<FoundCoin[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setCoins([...allFound()]);
    setEnabled(foundEnabled());
  }, []);

  useEffect(() => {
    loadFound().then(refresh);
  }, [refresh]);

  const toggle = async (on: boolean) => {
    await setFoundEnabled(on);
    refresh();
  };

  const lookAgain = async () => {
    setBusy(true);
    setError(null);
    try {
      await scanFound({ evm: keys.evm.address, solana: keys.solana.address }, true);
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const showAgain = async (c: FoundCoin) => {
    await setHiddenByYou(c.chain, c.address, false);
    refresh();
  };

  const hidden = coins.filter((c) => c.hidden);
  const shown = coins.filter((c) => !c.hidden).length;

  return (
    <Screen>
      <ListCard>
        <ListRow
          title="Show coins found automatically"
          subtitle="Coins already in Pearl’s wallet, if they’re real and worth something"
          right={
            <Switch
              accessibilityLabel="Show coins found automatically"
              value={enabled}
              onValueChange={toggle}
              trackColor={{ true: colors.sky, false: '#E8DCC4' }}
              thumbColor="#fff"
            />
          }
        />
        <ListRow last title="Only if worth at least" right={<Text style={s.pill}>${FOUND_MIN_USD.toFixed(2)}</Text>} />
      </ListCard>

      {mode === 'testnet' ? (
        <Banner tone="info">Found coins are for real money only. Test networks aren’t listed on CoinGecko.</Banner>
      ) : null}

      <Text style={s.note}>
        A coin shows up when it’s listed on CoinGecko for its network, has a price, is traded every day and Pearl holds
        at least ${FOUND_MIN_USD.toFixed(2)} of it. {shown ? `${shown} shown now.` : ''}
      </Text>

      {hidden.length ? (
        <>
          <Text style={s.section}>Hidden ({hidden.length})</Text>
          <ListCard>
            {hidden.map((c, i) => (
              <ListRow
                key={`${c.chain}:${c.address}`}
                last={i === hidden.length - 1}
                left={<TokenBadge symbol="?" chain={c.chain} found size={38} />}
                title={c.hidden === 'link-name' ? 'Coin with a link in its name' : c.symbol}
                subtitle={
                  <Text style={s.why}>
                    {HIDDEN_REASON_TEXT[c.hidden!]} · {getChain('mainnet', c.chain).name} · {shortAddress(c.address)}
                  </Text>
                }
                right={c.hidden === 'hidden-by-you' ? <LinkButton title="Show" onPress={() => showAgain(c)} /> : undefined}
              />
            ))}
          </ListCard>
        </>
      ) : null}

      <Banner tone="danger">
        Strangers can drop fake coins into any wallet to lure you to a scam website. Hidden coins can’t be opened or sent
        from here, and Pearl Wallet never shows their names if they contain a link.
      </Banner>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {mode === 'mainnet' && enabled ? (
        <Button title="Look for coins now" variant="secondary" onPress={lookAgain} loading={busy} />
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  pill: { backgroundColor: '#F4EAD6', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, fontWeight: '700', fontSize: 14 },
  note: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  section: { fontSize: 18, fontWeight: '700' },
  why: { fontSize: 12.5, color: colors.pinkDark, fontWeight: '600' },
});

