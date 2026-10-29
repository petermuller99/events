import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
  useFonts,
} from '@expo-google-fonts/fredoka';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntroDoneContext, LaunchIntro } from '../components/LaunchIntro';
import { colors, fonts } from '../components/ui';
import { ActivityProvider } from '../state/ActivityContext';
import { useWallet, WalletProvider } from '../state/WalletContext';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <WalletProvider>
        <StatusBar style="dark" />
        <ActivityProvider>
          <IntroDoneContext.Provider value={introDone}>
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
              <Routes />
              {!introDone ? <LaunchIntro onDone={finishIntro} /> : null}
            </View>
          </IntroDoneContext.Provider>
        </ActivityProvider>
      </WalletProvider>
    </SafeAreaProvider>
  );
}

/** Tapping a Pearl notification opens Activity, after unlocking if needed. */
function useOpenActivityFromNotification(unlocked: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const id = response?.notification.request.identifier;
    if (!id || !unlocked || handled.current === id) return;
    handled.current = id;
    router.push('/activity');
  }, [response, unlocked]);
}

function Routes() {
  const { status } = useWallet();
  useOpenActivityFromNotification(status === 'unlocked');
  // The launch intro covers the screen while the wallet state loads.
  if (status === 'loading') return null;
  // Where to send someone who lands on a screen they can't use in this state.
  const home = status === 'empty' ? '/welcome' : status === 'locked' ? '/unlock' : '/';
  // Each group of screens is only reachable in its wallet state; the router
  // redirects to an allowed screen whenever the state changes.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 20 },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={status === 'unlocked'} redirectTo={home}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="send" options={{ title: 'Send' }} />
        <Stack.Screen name="receive" options={{ title: 'Receive' }} />
        <Stack.Screen
          name="tx"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetAllowedDetents: [0.8],
            sheetGrabberVisible: true,
            sheetCornerRadius: 32,
          }}
        />
        <Stack.Screen name="phrase" options={{ title: 'Secret words' }} />
        <Stack.Screen name="addresses" options={{ title: 'My addresses' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'} redirectTo={home}>
        <Stack.Screen name="unlock" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'empty'} redirectTo={home}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: 'New wallet' }} />
        <Stack.Screen name="import" options={{ title: 'Import wallet' }} />
      </Stack.Protected>
    </Stack>
  );
}
