import * as LocalAuthentication from 'expo-local-authentication';

/** True if the phone has a passcode, PIN, pattern or biometrics set up. */
export async function deviceHasScreenLock(): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

/**
 * Asks for Face ID / fingerprint, falling back to the device passcode.
 * If the phone has no screen lock at all there is nothing to check against,
 * so this resolves true and the home screen shows a warning instead.
 */
export async function authenticate(reason: string): Promise<boolean> {
  if (!(await deviceHasScreenLock())) return true;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason });
  return result.success;
}
