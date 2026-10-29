import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import type { NetworkMode } from './config';
import { describeOutcome } from './notify-text';
import type { Prefs } from './prefs';
import type { SyncOutcome } from './sync';

const CHANNEL = 'activity';

/** Call once at startup. Shows Pearl's notifications even while the app is open. */
export function setupNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Money in and out',
      importance: AndroidImportance.HIGH,
      lightColor: '#FFBE45',
    }).catch(() => {});
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function notifyOutcome(mode: NetworkMode, outcome: SyncOutcome, prefs: Prefs): Promise<void> {
  const texts = describeOutcome(mode, outcome, prefs);
  if (!texts.length || !(await notificationsAllowed())) return;
  await Promise.all(
    texts.map((t) =>
      Notifications.scheduleNotificationAsync({
        content: { ...t, data: { url: '/activity' } },
        trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
      }),
    ),
  );
}
