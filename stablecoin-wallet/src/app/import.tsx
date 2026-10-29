import { useState } from 'react';
import { Banner, Body, Button, Field, Screen } from '../components/ui';
import { isValidMnemonic, normalizeMnemonic } from '../lib/keys';
import { errorMessage } from '../lib/wallet';
import { useWallet } from '../state/WalletContext';

export default function ImportWallet() {
  const { saveWallet } = useWallet();
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const words = normalizeMnemonic(phrase).split(' ').filter(Boolean).length;

  const submit = async () => {
    if (!isValidMnemonic(phrase)) {
      setError('That phrase is not valid. Check the spelling and order of each word.');
      return;
    }
    setBusy(true);
    try {
      await saveWallet(phrase);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Body muted>
        Enter your 12 or 24-word recovery phrase. Phrases from MetaMask, Trust Wallet and TronLink
        restore the same addresses.
      </Body>
      <Field
        label={`Recovery phrase (${words} words)`}
        value={phrase}
        onChangeText={(t) => {
          setPhrase(t);
          setError(null);
        }}
        multiline
        secureTextEntry={false}
        autoComplete="off"
        importantForAutofill="no"
        placeholder="word1 word2 word3 …"
        style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
        error={error}
      />
      <Banner tone="warning">Never type your phrase into a website or share it with anyone.</Banner>
      <Button title="Import wallet" onPress={submit} loading={busy} disabled={words < 12} />
    </Screen>
  );
}
