import { collect, currentTip, dayKey, emptyTips, isMoneyMaster, nextTip, tipDue, TIPS } from '../src/lib/tips';

describe('money tips', () => {
  it('has 10 tips with unique ids', () => {
    expect(TIPS).toHaveLength(10);
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(10);
  });

  it('shows the tips in order and wraps around', () => {
    let state = emptyTips();
    const shown: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = nextTip(state);
      shown.push(r.tip.id);
      state = r.state;
      expect(currentTip(state).id).toBe(r.tip.id);
    }
    expect(shown).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2]);
  });

  it('is due once a day', () => {
    const monday = dayKey(new Date(2026, 9, 26, 8));
    expect(monday).toBe('2026-10-26');
    expect(tipDue(emptyTips(), monday)).toBe(true);
    const shown = nextTip(emptyTips(), monday).state;
    expect(tipDue(shown, monday)).toBe(false);
    expect(tipDue(shown, dayKey(new Date(2026, 9, 26, 23, 59)))).toBe(false);
    expect(tipDue(shown, dayKey(new Date(2026, 9, 27, 0, 1)))).toBe(true);
  });

  it('collects each tip once and crowns a Money Master at 10', () => {
    let state = emptyTips();
    state = collect(collect(state, 4), 4);
    expect(state.collected).toEqual([4]);
    for (const t of TIPS) state = collect(state, t.id);
    expect(isMoneyMaster(state)).toBe(true);
    expect(isMoneyMaster(collect(emptyTips(), 1))).toBe(false);
  });
});
