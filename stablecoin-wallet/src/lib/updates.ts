import AsyncStorage from '@react-native-async-storage/async-storage';

// Test builds are published as GitHub pre-releases tagged pearl-wallet-test-<build>.
// The app knows its own build number (set by CI) and looks for a newer release.

const RELEASES_URL = 'https://api.github.com/repos/petermuller99/events/releases?per_page=20';
const TAG = /^pearl-wallet-test-(\d+)$/;
const KEY = 'pearl.update.v1';
/** Check at most this often, unless asked from Settings. */
const CHECK_EVERY_MS = 6 * 3600_000;

/** This build's number, or null in development builds. */
export const BUILD_NUMBER: number | null = Number(process.env.EXPO_PUBLIC_BUILD_NUMBER) || null;

export interface UpdateInfo {
  build: number;
  /** Release page with the APK download. */
  url: string;
}

interface Release {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  assets?: { name?: string }[];
}

/** The newest published build that has an APK attached. */
export function latestRelease(releases: Release[]): UpdateInfo | null {
  let best: UpdateInfo | null = null;
  for (const r of releases) {
    const m = TAG.exec(r.tag_name ?? '');
    if (!m || r.draft || !r.html_url || !r.assets?.some((a) => a.name?.endsWith('.apk'))) continue;
    const build = Number(m[1]);
    if (!best || build > best.build) best = { build, url: r.html_url };
  }
  return best;
}

/** A newer build than this one, if there is one. */
export function newerThan(current: number | null, latest: UpdateInfo | null): UpdateInfo | null {
  return current != null && latest && latest.build > current ? latest : null;
}

interface Cached {
  checkedAt: number;
  latest: UpdateInfo | null;
}

/**
 * Looks up the newest build on GitHub (cached for a few hours) and returns it if it's
 * newer than this one. Never throws: without a connection there's simply no update.
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (BUILD_NUMBER == null) return null;
  let cached: Cached | null = null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as Cached) : null;
  } catch {}
  if (!force && cached && Date.now() - cached.checkedAt < CHECK_EVERY_MS) {
    return newerThan(BUILD_NUMBER, cached.latest);
  }
  try {
    const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const latest = latestRelease((await res.json()) as Release[]);
    AsyncStorage.setItem(KEY, JSON.stringify({ checkedAt: Date.now(), latest })).catch(() => {});
    return newerThan(BUILD_NUMBER, latest);
  } catch {
    return newerThan(BUILD_NUMBER, cached?.latest ?? null);
  }
}
