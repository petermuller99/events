// Signs release builds with Pearl Wallet's own private key instead of the template's
// shared debug key (which anyone can download, and could then sign a fake "update").
//
// The key never lives in the repo: CI writes it from GitHub secrets and passes these
// environment variables to Gradle. Without them the release APK is left unsigned, so it
// can't be installed — there is no fallback to the debug key.
//   PEARL_KEYSTORE_FILE, PEARL_KEYSTORE_PASSWORD, PEARL_KEY_ALIAS, PEARL_KEY_PASSWORD
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (System.getenv('PEARL_KEYSTORE_FILE')) {
                storeFile file(System.getenv('PEARL_KEYSTORE_FILE'))
                storePassword System.getenv('PEARL_KEYSTORE_PASSWORD')
                keyAlias System.getenv('PEARL_KEY_ALIAS')
                keyPassword System.getenv('PEARL_KEY_PASSWORD')
            }
        }`;

function apply(gradle) {
  if (gradle.includes("PEARL_KEYSTORE_FILE")) return gradle;
  // Add a release signing config next to the debug one.
  const debugConfig = /(signingConfigs\s*\{\s*\n\s*debug\s*\{[^}]*\})/;
  if (!debugConfig.test(gradle)) throw new Error('withReleaseSigning: signingConfigs.debug not found');
  gradle = gradle.replace(debugConfig, `$1${SIGNING}`);
  // Point the release build type at it (never at the debug key).
  const releaseType = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseType.test(gradle)) throw new Error('withReleaseSigning: release signingConfig not found');
  gradle = gradle.replace(
    releaseType,
    "$1signingConfig System.getenv('PEARL_KEYSTORE_FILE') ? signingConfigs.release : null",
  );
  return gradle;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = apply(c.modResults.contents);
    return c;
  });
};
module.exports.apply = apply;
