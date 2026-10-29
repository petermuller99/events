import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useIntroDone } from '../components/LaunchIntro';
import { TipCardModal } from '../components/TipCard';
import { collect, currentTip, emptyTips, isMoneyMaster, loadTips, nextTip, saveTips, type Tip, type TipsState } from '../lib/tips';
import { useWallet } from './WalletContext';

interface TipsContextValue {
  state: TipsState;
  /** Tip of this login, shown on Home. */
  today: Tip | null;
  /** Re-open a tip, e.g. from the collection. */
  openTip: (tip: Tip) => void;
}

const TipsContext = createContext<TipsContextValue | null>(null);

/** Shows a new money tip each time the wallet is unlocked (or created). */
export function TipsProvider({ children }: { children: ReactNode }) {
  const { status } = useWallet();
  const introDone = useIntroDone();
  const [state, setState] = useState<TipsState>(emptyTips());
  const [today, setToday] = useState<Tip | null>(null);
  const [shown, setShown] = useState<{ tip: Tip | null; kind: 'new' | 'review' | 'master' } | null>(null);
  const wasUnlocked = useRef(false);

  useEffect(() => {
    loadTips().then((s) => {
      setState(s);
      if (s.next > 0 || s.collected.length) setToday(currentTip(s));
    });
  }, []);

  // A login is the moment the wallet becomes unlocked, once the launch intro is out of the way.
  useEffect(() => {
    const unlocked = status === 'unlocked';
    if (!unlocked) {
      wasUnlocked.current = false;
      return;
    }
    if (wasUnlocked.current || !introDone) return;
    wasUnlocked.current = true;
    loadTips().then((s) => {
      const r = nextTip(s);
      setState(r.state);
      setToday(r.tip);
      setShown({ tip: r.tip, kind: 'new' });
      saveTips(r.state).catch(() => {});
    });
  }, [status, introDone]);

  const close = useCallback(() => {
    if (shown?.kind === 'new' && shown.tip) {
      const wasMaster = isMoneyMaster(state);
      const next = collect(state, shown.tip.id);
      setState(next);
      saveTips(next).catch(() => {});
      // Collecting the 10th tip earns the crown.
      if (!wasMaster && isMoneyMaster(next)) {
        setShown({ tip: null, kind: 'master' });
        return;
      }
    }
    setShown(null);
  }, [shown, state]);

  const openTip = useCallback((tip: Tip) => setShown({ tip, kind: 'review' }), []);
  const value = useMemo(() => ({ state, today, openTip }), [state, today, openTip]);

  return (
    <TipsContext.Provider value={value}>
      {children}
      {shown ? (
        <TipCardModal tip={shown.tip} kind={shown.kind} collected={state.collected} onClose={close} />
      ) : null}
    </TipsContext.Provider>
  );
}

export function useTips(): TipsContextValue {
  const ctx = useContext(TipsContext);
  if (!ctx) throw new Error('useTips must be used inside TipsProvider');
  return ctx;
}
