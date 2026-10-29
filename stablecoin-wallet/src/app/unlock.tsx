import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Banner, Body, Button, Screen, Title } from '../components/ui';
import { useWallet } from '../state/WalletContext';

export default function Unlock() {
  const { unlock } = useWallet();
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

  // Prompt for Face ID / fingerprint as soon as the screen opens.
  useEffect(() => {
    run();
  }, [run]);

  const retry = () => {
    setBusy(true);
    setFailed(false);
    run();
  };

  return (
    <Screen>
      <View style={{ height: 96 }} />
      <Title>Wallet locked</Title>
      <Body muted>Unlock with Face ID, fingerprint or your phone’s passcode.</Body>
      {failed ? <Banner tone="warning">Unlock was cancelled or failed.</Banner> : null}
      <Button title="Unlock" onPress={retry} loading={busy} />
    </Screen>
  );
}
