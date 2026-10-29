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
  try {
    await saveLastBackgroundCheck(Date.now()).catch(() => {});
    const [watch, prefs] = await Promise.all([loadWatch(), loadPrefs()]);
    if (!watch || (!prefs.notifyReceived && !prefs.notifySends)) return BackgroundTask.BackgroundTaskResult.Success;
    const outcome = await syncActivity(watch.mode, watch.addresses);
    await notifyOutcome(watch.mode, outcome, prefs);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function enableBackgroundCheck(): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK))) {
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  }
}

export async function disableBackgroundCheck(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
}
