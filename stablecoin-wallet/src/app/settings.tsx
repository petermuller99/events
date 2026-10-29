import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { Banner, Body, Button, Card, colors, Row, Screen } from '../components/ui';
import { authenticate } from '../lib/auth';
import { CHAIN_IDS, getChain } from '../lib/config';
import { EVM_PATH, TRON_PATH } from '../lib/keys';
import { addressFor } from '../lib/wallet';
import { useUnlockedWallet } from '../state/WalletContext';

export default function Settings() {
  const { keys, mode, lock, revealPhrase, removeWallet } = useUnlockedWallet();
  const [phrase, setPhrase] = useState<string | null>(null);

  const reveal = async () => {
    if (phrase) {
      setPhrase(null);
      return;
    }
    setPhrase(await revealPhrase());
  };

  const confirmRemove = () => {
    Alert.alert(
      'Remove wallet from this phone?',
      'Your funds stay on the blockchain, but you can only get them back with your recovery phrase. Make sure you have it written down.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (await authenticate('Remove wallet')) await removeWallet();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Card>
        <Text style={s.heading}>Addresses ({mode})</Text>
        {CHAIN_IDS.map((id) => {
          const chain = getChain(mode, id);
          const address = addressFor(keys, id);
          return (
            <View key={id} style={{ gap: 4 }}>
              <Text style={s.chain}>{chain.name}</Text>
              <Text
                selectable
                style={s.address}
                onPress={() => Linking.openURL(chain.explorerAddressUrl(address))}
              >
                {address}
              </Text>
            </View>
          );
        })}
        <Body muted>Tap an address to open it in the block explorer.</Body>
      </Card>

      <Card>
        <Text style={s.heading}>Recovery phrase</Text>
        {phrase ? (
          <>
            <Text selectable={false} style={s.phrase}>
              {phrase}
            </Text>
            <Banner tone="warning">Make sure nobody can see your screen.</Banner>
          </>
        ) : null}
        <Button title={phrase ? 'Hide recovery phrase' : 'Show recovery phrase'} variant="secondary" onPress={reveal} />
      </Card>

      <Card>
        <Row label="Ethereum / BSC path" value={EVM_PATH} mono />
        <Row label="Tron path" value={TRON_PATH} mono />
        <Row label="Version" value={Constants.expoConfig?.version ?? '–'} />
      </Card>

      <Button title="Lock now" variant="secondary" onPress={lock} />
      <Button title="Remove wallet from this phone" variant="danger" onPress={confirmRemove} />
    </Screen>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 17, fontWeight: '700', color: colors.text },
  chain: { fontSize: 14, fontWeight: '600', color: colors.text },
  address: { fontFamily: 'monospace', fontSize: 13, color: colors.primary },
  phrase: { fontSize: 17, lineHeight: 28, color: colors.text, fontWeight: '600' },
});
