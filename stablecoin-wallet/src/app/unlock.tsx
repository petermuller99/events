import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIntroDone } from '../components/LaunchIntro';
import { Banner, Button, colors, Screen, Sticker, Text } from '../components/ui';
import { useWallet } from '../state/WalletContext';

export default function Unlock() {
  const { unlock } = useWallet();
  const introDone = useIntroDone();
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  const run = useCallback(
    () =>
      unlock()
        .then((ok) => setFailed(!ok))
        .catch(() => setFailed(true))
        .finally(() => setBusy(false)),
    [unlock],
  );

  // Prompt for Face ID / fingerprint once the launch intro is out of the way.
  useEffect(() => {
    if (introDone) run();
  }, [introDone, run]);

  const retry = () => {
    setBusy(true);
    setFailed(false);
    run();
  };

  return (
    <Screen honey>
      <View style={s.hero}>
        <Sticker name={failed ? 'hmm' : 'hello'} size={200} />
        <Text style={s.title}>{failed ? 'Hmm, try again?' : 'Welcome back'}</Text>
        <Text style={s.body}>Unlock with your fingerprint, face or phone passcode.</Text>
      </View>
      {failed ? <Banner tone="warning">Unlock was cancelled or didn’t work.</Banner> : null}
      <Button title="Unlock" variant="dark" onPress={retry} loading={busy} />
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', gap: 8, marginTop: 64, marginBottom: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  body: { fontSize: 16, color: colors.text, textAlign: 'center' },
});
