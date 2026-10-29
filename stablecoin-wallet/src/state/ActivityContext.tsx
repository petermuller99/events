import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { Celebration, type CelebrationEvent } from '../components/Celebration';
import type { ActivityItem } from '../lib/activity';
import { disableBackgroundCheck, enableBackgroundCheck } from '../lib/background';
import { notifyOutcome, requestNotificationPermission } from '../lib/notify';
import {
  defaultPrefs,
  hasAskedForNotifications,
  loadPrefs,
  savePrefs,
  saveWatch,
  setAskedForNotifications,
  type Prefs,
} from '../lib/prefs';
import { loadActivity, recordSend as storeSend, syncActivity } from '../lib/sync';
import { useWallet } from './WalletContext';

interface ActivityContextValue {
  items: ActivityItem[];
  refreshing: boolean;
  prefs: Prefs;
  refresh: () => Promise<void>;
  recordSend: (item: ActivityItem) => Promise<void>;
  /** Returns false if the phone's notification permission is off. */
  setPrefs: (prefs: Prefs) => Promise<boolean>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

const POLL_MS = 30_000;
/** Faster while a send is on its way, so the tracker updates quickly. */
const PENDING_POLL_MS = 6_000;
/**
 * Keep checking this long after the app is left in the background. Android keeps the
 * app running for a while, so money that arrives soon after switching away (the common
 * case) still notifies quickly. After that, the OS background check (≥15 min) takes over.
 */
const BACKGROUND_POLL_WINDOW_MS = 10 * 60_000;

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { keys, mode } = useWallet();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(defaultPrefs);
  const [polling, setPolling] = useState(AppState.currentState === 'active');
  const [celebration, setCelebration] = useState<CelebrationEvent | null>(null);
  const prefsRef = useRef(prefs);

  const addresses = useMemo(() => (keys ? { evm: keys.evm.address, tron: keys.tron.address } : null), [keys]);

  useEffect(() => {
    loadPrefs().then((p) => {
      prefsRef.current = p;
      setPrefsState(p);
    });
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (s) => {
      clearTimeout(stopTimer);
      if (s === 'active') setPolling(true);
      else if (s === 'background') stopTimer = setTimeout(() => setPolling(false), BACKGROUND_POLL_WINDOW_MS);
    });
    return () => {
      clearTimeout(stopTimer);
      sub.remove();
    };
  }, []);

  // Show what's stored immediately, then keep the background check pointed at this wallet.
  useEffect(() => {
    let current = true;
    loadActivity(mode).then((s) => current && setItems(s.items));
    if (addresses) {
      saveWatch({ mode, addresses }).catch(() => {});
      (async () => {
        const p = await loadPrefs();
        if (!(await hasAskedForNotifications())) {
          await setAskedForNotifications();
          await requestNotificationPermission();
        }
        if (p.notifyReceived || p.notifySends) await enableBackgroundCheck().catch(() => {});
      })();
    }
    return () => {
      current = false;
    };
  }, [mode, addresses]);

  const refresh = useCallback(async () => {
    if (!addresses) return;
    setRefreshing(true);
    try {
      const outcome = await syncActivity(mode, addresses);
      setItems(outcome.items);
      // While the app is open, money arriving or a send landing gets a little celebration.
      const arrived = outcome.settled.filter((i) => i.status === 'confirmed');
      const onScreen = AppState.currentState === 'active';
      if (onScreen && outcome.received.length) setCelebration({ kind: 'in', items: outcome.received });
      else if (onScreen && arrived.length) setCelebration({ kind: 'arrived', items: arrived });
      await notifyOutcome(mode, outcome, prefsRef.current).catch(() => {});
    } catch {
      // Network trouble: keep showing what we have.
    } finally {
      setRefreshing(false);
    }
  }, [mode, addresses]);

  const hasPending = items.some((i) => i.status === 'pending');
  useEffect(() => {
    if (!addresses || !polling) return;
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, hasPending ? PENDING_POLL_MS : POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [addresses, polling, hasPending, refresh]);

  const recordSend = useCallback(
    async (item: ActivityItem) => {
      setItems(await storeSend(mode, item));
    },
    [mode],
  );

  const setPrefs = useCallback(async (next: Prefs) => {
    const wantsAny = next.notifyReceived || next.notifySends;
    const allowed = wantsAny ? await requestNotificationPermission() : true;
    prefsRef.current = next;
    setPrefsState(next);
    await savePrefs(next);
    await (wantsAny ? enableBackgroundCheck() : disableBackgroundCheck()).catch(() => {});
    return allowed;
  }, []);

  const value = useMemo(
    () => ({ items, refreshing, prefs, refresh, recordSend, setPrefs }),
    [items, refreshing, prefs, refresh, recordSend, setPrefs],
  );
  return (
    <ActivityContext.Provider value={value}>
      {children}
      <Celebration mode={mode} event={celebration} onClose={() => setCelebration(null)} />
    </ActivityContext.Provider>
  );
}

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivity must be used inside ActivityProvider');
  return ctx;
}
