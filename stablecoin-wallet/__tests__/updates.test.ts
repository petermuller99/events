import { latestRelease, newerThan } from '../src/lib/updates';

describe('app updates', () => {
  const rel = (n: number, apk = true) => ({
    tag_name: `pearl-wallet-test-${n}`,
    html_url: `https://github.com/x/releases/tag/pearl-wallet-test-${n}`,
    assets: apk ? [{ name: 'pearl-wallet-test.apk' }] : [],
  });

  it('finds the newest build with an APK', () => {
    expect(latestRelease([rel(21), rel(24, false), rel(23), { tag_name: 'v9' }])?.build).toBe(23);
    expect(latestRelease([])).toBeNull();
  });

  it('offers only a newer build, and nothing in development builds', () => {
    const latest = latestRelease([rel(24)]);
    expect(newerThan(23, latest)?.build).toBe(24);
    expect(newerThan(24, latest)).toBeNull();
    expect(newerThan(null, latest)).toBeNull();
  });
});
