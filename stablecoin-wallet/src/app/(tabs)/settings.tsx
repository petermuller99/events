import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Switch, View } from 'react-native';
import { Chevron } from '../../components/icons';
import { ListCard, ListRow } from '../../components/money';
import { Button, colors, Screen, Sticker, Text } from '../../components/ui';
import { authenticate } from '../../lib/auth';
import { openBatterySettings } from '../../lib/battery';
import { loadLastBackgroundCheck, type Prefs } from '../../lib/prefs';
import { BUILD_NUMBER, checkForUpdate, type UpdateInfo } from '../../lib/updates';
import { useActivity } from '../../state/ActivityContext';
import { useUnlockedWallet } from '../../state/WalletContext';

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.sky, false: '#E8DCC4' }}
      thumbColor="#fff"
    />
  );
}

function timeAgo(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(at).toLocaleDateString();
}

export default function Settings() {
  const { mode, setMode, lock, removeWallet } = useUnlockedWallet();
  const { prefs, setPrefs } = useActivity();
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  const [update, setUpdate] = useState<{ checking: boolean; found?: UpdateInfo | null }>({ checking: false });

  const checkUpdates = async () => {
    setUpdate({ checking: true });
    setUpdate({ checking: false, found: await checkForUpdate(true) });
  };

  useFocusEffect(
    useCallback(() => {
      loadLastBackgroundCheck().then(setLastCheck);
    }, []),
  );

  const updatePrefs = async (next: Prefs) => {
    const allowed = await setPrefs(next);
    if (!allowed) {
      Alert.alert(
        'Notifications are off',
        'Pearl Wallet can’t show notifications until you allow them in your phone’s settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  const setTestMoney = (on: boolean) => {
    if (on) {
      setMode('testnet');
      return;
    }
    Alert.alert('Use real money?', 'Real money can’t be taken back once it’s sent. Double-check every address.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use real money', style: 'destructive', onPress: () => setMode('mainnet') },
    ]);
  };

  const confirmRemove = () => {
    Alert.alert(
      'Remove wallet from this phone?',
      'Your money stays on the blockchain, but you can only get it back with your secret words. Make sure you have them written down.',
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

  const chevron = <Chevron color={colors.muted} />;
  return (
    <Screen tab>
      <Text style={s.title}>Settings</Text>

      <Text style={s.section}>Notifications</Text>
      <ListCard>
        <ListRow
          title="Money received"
          subtitle="When dollars or fee coins arrive"
          right={
            <Toggle
              label="Money received notifications"
              value={prefs.notifyReceived}
              onChange={(v) => updatePrefs({ ...prefs, notifyReceived: v })}
            />
          }
        />
        <ListRow
          last
          title="Sends"
          subtitle="When your send arrives or fails"
          right={
            <Toggle
              label="Send notifications"
              value={prefs.notifySends}
              onChange={(v) => updatePrefs({ ...prefs, notifySends: v })}
            />
          }
        />
      </ListCard>
      {Platform.OS === 'android' ? (
        <ListCard>
          <ListRow
            last
            title="Let it check in the background"
            subtitle="Stop battery saver from pausing Pearl Wallet"
            right={chevron}
            onPress={openBatterySettings}
          />
        </ListCard>
      ) : null}
      <Text style={s.note}>
        Instant while Pearl Wallet is open, and for 10 minutes after you leave it. After that, your phone checks
        about every 15 minutes, or less often if battery saver is on.
      </Text>
      <Text style={s.note}>Last background check: {lastCheck ? timeAgo(lastCheck) : 'not yet'}</Text>

      <Text style={s.section}>Wallet</Text>
      <ListCard>
        <ListRow
          title="Test money"
          subtitle={mode === 'testnet' ? 'On: practising with free test coins' : 'Practise with free test coins'}
          right={<Toggle label="Test money" value={mode === 'testnet'} onChange={setTestMoney} />}
        />
        <ListRow title="Networks" subtitle="Ethereum · BNB Chain · Solana" />
        <ListRow title="Show my secret words" right={chevron} onPress={() => router.push('/phrase')} />
        <ListRow title="My addresses" right={chevron} onPress={() => router.push('/addresses')} />
        <ListRow last title="Lock now" right={chevron} onPress={lock} />
      </ListCard>

      <Text style={s.section}>App</Text>
      <ListCard>
        <ListRow
          last
          title="App version"
          subtitle={
            BUILD_NUMBER == null
              ? 'Development build'
              : update.checking
                ? `Build ${BUILD_NUMBER} · checking…`
                : update.found
                  ? `Build ${BUILD_NUMBER} · build ${update.found.build} is available, tap to download`
                  : update.found === null
                    ? `Build ${BUILD_NUMBER} · you’re up to date ✅`
                    : `Build ${BUILD_NUMBER}`
          }
          right={<Text style={s.check}>{update.found ? 'Update' : 'Check'}</Text>}
          onPress={() => (update.found ? Linking.openURL(update.found.url) : checkUpdates())}
        />
      </ListCard>

      <Button title="Remove wallet from this phone" variant="danger" onPress={confirmRemove} />

      <View style={s.footer}>
        <Sticker name="hello" size={90} />
        <Text style={s.note}>Pearl Wallet · version {Constants.expoConfig?.version ?? '–'}</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  check: { fontSize: 14, fontWeight: '700', color: colors.skyDark },
  title: { fontSize: 30, fontWeight: '700', marginTop: 4 },
  section: { fontSize: 13, fontWeight: '600', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 4, marginTop: 4 },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  footer: { alignItems: 'center', gap: 4, marginTop: 8 },
});
