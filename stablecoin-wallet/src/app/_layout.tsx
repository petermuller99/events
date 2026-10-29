import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { useWallet, WalletProvider } from '../state/WalletContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <WalletProvider>
        <StatusBar style="dark" />
        <Routes />
      </WalletProvider>
    </SafeAreaProvider>
  );
}

function Routes() {
  const { status } = useWallet();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  // Each group of screens is only reachable in its wallet state; the router
  // redirects to an allowed screen whenever the state changes.
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={status === 'unlocked'}>
        <Stack.Screen name="index" options={{ title: 'Wallet' }} />
        <Stack.Screen name="send" options={{ title: 'Send' }} />
        <Stack.Screen name="receive" options={{ title: 'Receive' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="unlock" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'empty'}>
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="create" options={{ title: 'New wallet' }} />
        <Stack.Screen name="import" options={{ title: 'Import wallet' }} />
      </Stack.Protected>
    </Stack>
  );
}
