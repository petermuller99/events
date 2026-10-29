// Polyfills must load before ethers, so they run ahead of the router entry.
import './src/polyfills';
// Registers the background activity check before the app renders.
import { ensureBackgroundCheck } from './src/lib/background';
import { setupNotifications } from './src/lib/notify';
import 'expo-router/entry';

setupNotifications();
ensureBackgroundCheck().catch(() => {});
