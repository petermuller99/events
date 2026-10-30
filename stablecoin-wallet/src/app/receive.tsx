import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Share, StyleSheet, Switch, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Banner, Body, Button, Card, Chips, brandImages, colors, Screen, Text } from '../components/ui';
import { CHAIN_IDS, getChain, type ChainId } from '../lib/config';
import { giftLink, giftMessage, loadGiftSettings, saveGiftSettings, type GiftSettings } from '../lib/gift';
import { addressFor } from '../lib/wallet';
import { useUnlockedWallet } from '../state/WalletContext';

export default function Receive() {
  const params = useLocalSearchParams<{ chain?: string }>();
  const { keys, mode } = useUnlockedWallet();
  const [chainId, setChainId] = useState<ChainId>(
    CHAIN_IDS.includes(params.chain as ChainId) ? (params.chain as ChainId) : 'ethereum',
  );
  const [copied, setCopied] = useState(false);
  const [gift, setGift] = useState<GiftSettings>({ photo: false });

  useEffect(() => {
    loadGiftSettings().then(setGift);
  }, []);

  const shareGift = () => {
    const link = giftLink(keys, 'Pearl', gift);
    Share.share({ message: giftMessage('Pearl', link) }).catch(() => {});
  };

  const setPhoto = (photo: boolean) => {
    const next = { ...gift, photo };
    setGift(next);
    saveGiftSettings(next).catch(() => {});
  };
  const chain = getChain(mode, chainId);
  const address = addressFor(keys, chainId);
  const tokens = chain.tokens.map((t) => t.symbol).join(' or ');

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Screen>
      <Chips
        value={chainId}
        onChange={(c) => {
          setChainId(c);
          setCopied(false);
        }}
        options={CHAIN_IDS.map((id) => ({ value: id, label: getChain(mode, id).name }))}
      />
      <Card style={{ alignItems: 'center' }}>
        <View style={{ padding: 14, backgroundColor: '#fff', borderRadius: 18 }}>
          <QRCode
            value={address}
            size={220}
            color={colors.text}
            logo={brandImages.mark}
            logoSize={52}
            logoBackgroundColor="#fff"
            logoBorderRadius={12}
            ecl="H"
          />
        </View>
        <Text selectable style={{ fontFamily: 'monospace', fontSize: 14, color: colors.text, textAlign: 'center' }}>
          {address}
        </Text>
        <Button title={copied ? 'Copied' : 'Copy address'} onPress={copy} style={{ alignSelf: 'stretch' }} />
      </Card>
      <Banner tone="warning">
        Only send {tokens} ({chain.standard}) or {chain.nativeSymbol} on {chain.name} to this address.
        Tokens sent from another network may be lost.
      </Banner>
      {chain.kind === 'evm' ? (
        <Body muted>This same address also receives on the other EVM network (Ethereum and BSC).</Body>
      ) : null}
      {mode === 'mainnet' ? (
        <View style={st.gift}>
          <Text style={st.giftTitle}>🎁 Pocket money from family</Text>
          <Text style={st.giftText}>
            Send grandma, aunties and uncles a link. They can send Pearl money from any wallet or exchange.
          </Text>
          <Button title="Share a gift link" variant="dark" onPress={shareGift} />
          <View style={st.photoRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.photoTitle}>Show Pearl’s photo on the page</Text>
              <Text style={st.photoNote}>Anyone with the link can see the page.</Text>
            </View>
            <Switch
              accessibilityLabel="Show Pearl’s photo on the gift page"
              value={gift.photo}
              onValueChange={setPhoto}
              trackColor={{ true: colors.sky, false: '#E8DCC4' }}
              thumbColor="#fff"
            />
          </View>
        </View>
      ) : null}
      {chain.faucetUrl ? (
        <Button
          title={`Get free test ${chain.nativeSymbol} / tokens`}
          variant="secondary"
          onPress={() => Linking.openURL(chain.faucetUrl!)}
        />
      ) : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  gift: { backgroundColor: '#FFF0C2', borderColor: '#F5D27A', borderWidth: 2, borderRadius: 22, padding: 14, gap: 8 },
  giftTitle: { fontSize: 17, fontWeight: '700' },
  giftText: { fontSize: 14, lineHeight: 20, color: colors.muted },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  photoTitle: { fontSize: 14, fontWeight: '600' },
  photoNote: { fontSize: 12, color: colors.muted },
});
