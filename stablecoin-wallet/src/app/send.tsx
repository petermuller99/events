import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  Banner,
  Body,
  Button,
  Card,
  Chips,
  colors,
  Field,
  fonts,
  LinkButton,
  Row,
  Screen,
  shortAddress,
  shortHash,
  Sticker,
  Text,
  Tiles,
} from '../components/ui';
import { formatAmount, parseAmount, toInputAmount } from '../lib/amount';
import { authenticate } from '../lib/auth';
import { CHAIN_IDS, getChain, type ChainId } from '../lib/config';
import {
  addressFor,
  errorMessage,
  fetchChainBalances,
  findAsset,
  listAssets,
  quoteTransfer,
  sendTransfer,
  validateRecipient,
  type AssetId,
  type ChainBalances,
  type FeeQuote,
  type SendResult,
  type TransferRequest,
} from '../lib/wallet';
import { SendTracker } from '../components/SendTracker';
import { activityId, pendingSend } from '../lib/activity';
import { useActivity } from '../state/ActivityContext';
import { useUnlockedWallet } from '../state/WalletContext';

type Step = 'form' | 'review' | 'done';

export default function Send() {
  const params = useLocalSearchParams<{ chain?: string; asset?: string }>();
  const { keys, mode } = useUnlockedWallet();
  const activity = useActivity();

  const initialChain = CHAIN_IDS.includes(params.chain as ChainId) ? (params.chain as ChainId) : 'ethereum';
  const [chainId, setChainId] = useState<ChainId>(initialChain);
  const [assetId, setAssetId] = useState<AssetId>(
    findAsset(mode, initialChain, params.asset as AssetId)?.id ?? listAssets(mode, initialChain)[0].id,
  );
  const [to, setTo] = useState('');
  const [amountText, setAmountText] = useState('');
  const [loaded, setLoaded] = useState<{ key: string; data: ChainBalances } | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [request, setRequest] = useState<TransferRequest | null>(null);
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  const chain = getChain(mode, chainId);
  const assets = listAssets(mode, chainId);
  const asset = findAsset(mode, chainId, assetId) ?? assets[0];
  const ownAddress = addressFor(keys, chainId);
  const balancesKey = `${mode}:${chainId}`;
  const balances = loaded?.key === balancesKey ? loaded.data : null;
  const balance = balances?.assets.find((a) => a.asset.id === asset.id)?.balance;

  useEffect(() => {
    let current = true;
    fetchChainBalances(mode, keys, chainId).then((data) => {
      if (current) setLoaded({ key: `${mode}:${chainId}`, data });
    });
    return () => {
      current = false;
    };
  }, [mode, keys, chainId]);

  const selectChain = (next: ChainId) => {
    setChainId(next);
    setAssetId(listAssets(mode, next)[0].id);
    setError(null);
  };

  const recipientError = touched || to ? validateRecipient(chainId, to, ownAddress) : null;

  const pasteAddress = async () => {
    setTo((await Clipboard.getStringAsync()).trim());
  };

  const review = async () => {
    setTouched(true);
    setError(null);
    if (validateRecipient(chainId, to, ownAddress)) return;
    let amount: bigint;
    try {
      amount = parseAmount(amountText, asset.decimals);
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    if (balance != null && amount > balance) {
      setError(`You only have ${formatAmount(balance, asset.decimals)} ${asset.symbol}`);
      return;
    }
    const req = { asset, to: to.trim(), amount };
    setBusy(true);
    try {
      setQuote(await quoteTransfer(mode, keys, req));
      setRequest(req);
      setStep('review');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!request || !quote) return;
    setError(null);
    if (!(await authenticate(`Send ${amountText} ${asset.symbol}`))) return;
    setBusy(true);
    try {
      const sent = await sendTransfer(mode, keys, request, quote);
      // Show it in Activity straight away; syncing then tracks it until it's confirmed.
      await activity.recordSend(pendingSend(chainId, asset, request.to, request.amount, sent.hash)).catch(() => {});
      setResult(sent);
      setStep('done');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'done' && result) {
    const tracked = activity.items.find((i) => i.id === activityId(chainId, result.hash, asset.id, 'out'));
    const status = tracked?.status ?? 'pending';
    const to = request ? shortAddress(request.to) : '';
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Sticker name={status === 'failed' ? 'hmm' : status === 'confirmed' ? 'laugh' : 'wheee'} size={170} />
          <Text style={{ fontSize: 28, fontWeight: '700', textAlign: 'center' }}>
            {status === 'failed'
              ? 'Hmm, that didn’t go through'
              : status === 'confirmed'
                ? 'It arrived!'
                : 'Wheee, it’s on its way!'}
          </Text>
          <Body muted>
            {status === 'failed'
              ? 'Your money is still in your wallet.'
              : `${amountText} ${asset.symbol} to ${to} on ${chain.name}`}
          </Body>
        </View>
        {status !== 'failed' ? (
          <SendTracker status={status} notify={activity.prefs.notifySends} />
        ) : null}
        <Card>
          <Row label="Network" value={`${chain.name} (${asset.contract ? chain.standard : 'fee coin'})`} />
          <Row label="Transaction" value={shortHash(result.hash)} mono />
        </Card>
        <Button
          title={`View on ${chain.explorerName}`}
          variant="secondary"
          onPress={() => Linking.openURL(result.explorerUrl)}
        />
        <Button title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (step === 'review' && request && quote) {
    const short = quote.nativeRequired - quote.nativeBalance;
    const fmtNative = (v: bigint) => `${formatAmount(v, chain.nativeDecimals, 8)} ${chain.nativeSymbol}`;
    return (
      <Screen>
        {mode === 'mainnet' ? <Banner tone="danger">Real funds. This cannot be undone.</Banner> : null}
        <Card>
          <Row label="Send" value={`${formatAmount(request.amount, asset.decimals, asset.decimals)} ${asset.symbol}`} />
          <Row label="Network" value={`${chain.name} (${asset.contract ? chain.standard : 'native'})`} />
          <Row label="To" value={request.to} mono />
          <Row
            label={quote.isMaximum ? 'Network fee (max)' : 'Network fee (est.)'}
            value={fmtNative(quote.fee - (quote.setupFee ?? 0n))}
          />
          {quote.setupFee ? <Row label="Account setup" value={fmtNative(quote.setupFee)} /> : null}
          <Row label={`Your ${chain.nativeSymbol}`} value={fmtNative(quote.nativeBalance)} />
        </Card>
        {quote.setupFee ? (
          <Banner tone="info" sticker="curious">
            This person has never had {asset.symbol} on {chain.name}, so a one-time account setup is paid from your{' '}
            {chain.nativeSymbol}. Next time it’s free.
          </Banner>
        ) : null}
        {quote.notes.map((n) => (
          <Banner key={n} tone="info">
            {n}
          </Banner>
        ))}
        {short > 0n ? (
          <Banner tone="danger">
            Not enough {chain.nativeSymbol} for the network fee. Add at least {fmtNative(short)} to{' '}
            {chain.name} first.
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="danger" sticker="hmm">
            {error}
          </Banner>
        ) : null}
        <Button title="Confirm and send" onPress={confirm} loading={busy} disabled={short > 0n} />
        <Button title="Back" variant="secondary" onPress={() => setStep('form')} disabled={busy} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={st.label}>Network</Text>
      <Tiles
        value={chainId}
        onChange={selectChain}
        options={CHAIN_IDS.map((id) => ({ value: id, label: SHORT_NAMES[id] }))}
      />
      {assets.length > 1 ? (
        <Chips
          value={asset.id}
          onChange={(id) => {
            setAssetId(id);
            setError(null);
          }}
          options={assets.map((a) => ({ value: a.id, label: a.contract ? a.symbol : `${a.symbol} (fee coin)` }))}
        />
      ) : null}

      <Field
        label="To"
        value={to}
        onChangeText={setTo}
        onBlur={() => setTouched(true)}
        placeholder={chain.kind === 'solana' ? 'Solana address' : 'Address (0x…)'}
        error={recipientError}
        right={<LinkButton title="Paste" onPress={pasteAddress} />}
      />

      <Text style={st.label}>Amount</Text>
      <View style={st.amountCard}>
        <TextInput
          // Stablecoins show as dollars: the "$" is part of the text, stripped again on input.
          value={asset.contract && amountText ? `$${amountText}` : amountText}
          onChangeText={(t) => {
            setAmountText(t.replace(/[^0-9.,]/g, ''));
            setError(null);
          }}
          keyboardType="decimal-pad"
          placeholder={asset.contract ? '$0.00' : `0 ${asset.symbol}`}
          placeholderTextColor={colors.border}
          style={st.amountInput}
          accessibilityLabel={`Amount in ${asset.symbol}`}
        />
        <Text style={st.have}>
          {balance != null
            ? `You have ${asset.contract ? '$' : ''}${formatAmount(balance, asset.decimals, asset.contract ? 2 : 6, asset.contract ? 2 : 0)} ${asset.symbol}`
            : balances?.error ?? '…'}
        </Text>
      </View>
      {/* Max only for tokens: for the native coin the fee has to come out of it too. */}
      {asset.contract ? (
        <View style={st.quick}>
          {['1', '5', '10'].map((v) => (
            <Pressable key={v} style={st.quickButton} onPress={() => setAmountText(v)} accessibilityRole="button">
              <Text style={st.quickText}>${v}</Text>
            </Pressable>
          ))}
          {balance ? (
            <Pressable
              style={st.quickButton}
              onPress={() => setAmountText(toInputAmount(balance, asset.decimals))}
              accessibilityRole="button"
            >
              <Text style={st.quickText}>Max</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {asset.contract ? (
        <Body muted>
          Sending {asset.symbol} on {chain.name} needs a little {chain.nativeSymbol} in this wallet for the network fee.
        </Body>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title="Review" onPress={review} loading={busy} disabled={!to || !amountText} />
    </Screen>
  );
}

const SHORT_NAMES: Record<ChainId, string> = { ethereum: 'Ethereum', bsc: 'BNB Chain', solana: 'Solana' };

const st = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '600', marginBottom: -6 },
  amountCard: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  amountInput: {
    fontSize: 40,
    fontFamily: fonts.bold,
    color: colors.text,
    alignSelf: 'stretch',
    textAlign: 'center',
    paddingVertical: 0,
  },
  have: { fontSize: 13, color: colors.muted },
  quick: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  quickButton: { backgroundColor: colors.skyLight, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  quickText: { fontSize: 15, fontWeight: '600', color: colors.skyDark },
});
