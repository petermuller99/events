import { getRandomBytes } from 'expo-crypto';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Body, Button, colors, Field, Screen } from '../components/ui';
import { mnemonicFromEntropy } from '../lib/keys';
import { errorMessage } from '../lib/wallet';
import { useWallet } from '../state/WalletContext';

/** Picks two distinct word positions for the user to confirm. */
function pickChallenge(count: number): [number, number] {
  const [a, b] = getRandomBytes(2);
  const first = a % count;
  let second = b % count;
  if (second === first) second = (first + 1) % count;
  return first < second ? [first, second] : [second, first];
}

export default function CreateWallet() {
  const { saveWallet } = useWallet();
  const [phrase] = useState(() => mnemonicFromEntropy(getRandomBytes(16)));
  const words = phrase.split(' ');
  const [challenge] = useState(() => pickChallenge(words.length));
  const [step, setStep] = useState<'show' | 'verify'>('show');
  const [answers, setAnswers] = useState(['', '']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    const ok = challenge.every((pos, i) => answers[i].trim().toLowerCase() === words[pos]);
    if (!ok) {
      setError('Those words do not match. Check what you wrote down.');
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

  if (step === 'show') {
    return (
      <Screen>
        <Body>Write these 12 words down on paper, in order. They are the only way to restore your wallet.</Body>
        <View style={s.grid}>
          {words.map((w, i) => (
            <View key={i} style={s.word}>
              <Text style={s.index}>{i + 1}</Text>
              <Text style={s.text}>{w}</Text>
            </View>
          ))}
        </View>
        <Banner tone="warning">
          Anyone with these words can take your funds. Don’t screenshot them, store them in the cloud or
          share them.
        </Banner>
        <Button title="I've written them down" onPress={() => setStep('verify')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body>Confirm two words from your recovery phrase.</Body>
      {challenge.map((pos, i) => (
        <Field
          key={pos}
          label={`Word #${pos + 1}`}
          value={answers[i]}
          onChangeText={(t) => {
            setAnswers((prev) => prev.map((v, j) => (j === i ? t : v)));
            setError(null);
          }}
        />
      ))}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title="Create wallet" onPress={verify} loading={busy} />
      <Button title="Show the words again" variant="secondary" onPress={() => setStep('show')} />
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: {
    width: '31%',
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  index: { color: colors.muted, fontSize: 12, width: 16 },
  text: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
