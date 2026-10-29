import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Banner, Body, Button, Card, Chips, brandImages, colors, Screen, Text } from '../components/ui';
import { CHAIN_IDS, getChain, type ChainId } from '../lib/config';
import { addressFor } from '../lib/wallet';
import { useUnlockedWallet } from '../state/WalletContext';

export default function Receive() {
  const params = useLocalSearchParams<{ chain?: string }>();
  const { keys, mode } = useUnlockedWallet();
  const [chainId, setChainId] = useState<ChainId>(
    CHAIN_IDS.includes(params.chain as ChainId) ? (params.chain as ChainId) : 'ethereum',
  );
  const [copied, setCopied] = useState(false);
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
