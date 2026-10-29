import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { notifyOutcome } from './notify';
import { loadPrefs, loadWatch, saveLastBackgroundCheck } from './prefs';
import { syncActivity } from './sync';

// Checks for new money while Pearl is closed. The OS decides when this runs:
// roughly every 15 minutes at best, less often in battery saver.

const TASK = 'pearl-activity-check';

// Must run at app start (imported from index.ts) so the OS can wake the task headlessly.
TaskManager.defineTask(TASK, async () => {
  // Logged so the emulator test in CI can confirm the check really ran.
  console.log('[pearl] background check started');
  try {
    await saveLastBackgroundCheck(Date.now()).catch(() => {});
    const [watch, prefs] = await Promise.all([loadWatch(), loadPrefs()]);
    if (!watch || (!prefs.notifyReceived && !prefs.notifySends)) {
      console.log('[pearl] background check done: nothing to watch');
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    const outcome = await syncActivity(watch.mode, watch.addresses);
    await notifyOutcome(watch.mode, outcome, prefs);
    console.log(`[pearl] background check done: ${outcome.received.length} in, ${outcome.settled.length} settled`);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.log('[pearl] background check failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * (Re)schedules the background check. Safe to call on every launch: Android keeps one
 * scheduled run and this only re-attaches the task to it. Always registering, rather
 * than skipping when the task looks registered, matters after an app update, when the
 * saved registration can point at code that no longer exists under that name.
 */
export async function enableBackgroundCheck(): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
}

/** Called once at app start, so the check is scheduled even before the wallet is unlocked. */
export async function ensureBackgroundCheck(): Promise<void> {
  const prefs = await loadPrefs();
  if (prefs.notifyReceived || prefs.notifySends) await enableBackgroundCheck();
}

export async function disableBackgroundCheck(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
}
