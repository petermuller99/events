import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

/**
 * Many Android phones put apps to sleep to save battery, which stops the background
 * check for new money. This asks Android to let Pearl Wallet run, falling back to
 * the battery settings list and then to the app's own settings page.
 */
export async function openBatterySettings(): Promise<void> {
  if (Platform.OS !== 'android') return Linking.openSettings();
  const pkg = Constants.expoConfig?.android?.package;
  const attempts: (() => Promise<unknown>)[] = [
    () =>
      IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
        data: `package:${pkg}`,
      }),
    () => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
    () => Linking.openSettings(),
  ];
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // Not available on this phone: try the next one.
    }
  }
}
