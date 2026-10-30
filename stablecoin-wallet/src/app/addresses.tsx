import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { ListCard, ListRow } from '../components/money';
import { colors, LinkButton, Screen, Text } from '../components/ui';
import { CHAIN_IDS, getChain, type ChainId } from '../lib/config';
import { EVM_PATH } from '../lib/keys';
import { SOLANA_PATH } from '../lib/solana';
import { addressFor } from '../lib/wallet';
import { useUnlockedWallet } from '../state/WalletContext';

export default function Addresses() {
  const { keys, mode } = useUnlockedWallet();
  const [copied, setCopied] = useState<ChainId | null>(null);

  const copy = async (id: ChainId) => {
    await Clipboard.setStringAsync(addressFor(keys, id));
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Screen>
      <ListCard>
        {CHAIN_IDS.map((id, i) => {
          const chain = getChain(mode, id);
          const address = addressFor(keys, id);
          return (
            <ListRow
              key={id}
              last={i === CHAIN_IDS.length - 1}
              title={chain.name}
              subtitle={address}
              right={
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <LinkButton title={copied === id ? 'Copied' : 'Copy'} onPress={() => copy(id)} />
                  <LinkButton title="View" onPress={() => Linking.openURL(chain.explorerAddressUrl(address))} />
                </View>
              }
            />
          );
        })}
      </ListCard>
      <Text style={s.note}>
        Ethereum and BNB Chain share one address. The same secret words restore these in MetaMask, Trust Wallet
        and Phantom.
      </Text>
      <Text style={s.note}>
        Paths: {EVM_PATH} (Ethereum, BNB Chain) · {SOLANA_PATH} (Solana)
      </Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  note: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
});
