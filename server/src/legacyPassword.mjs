import { FirebaseScrypt } from 'firebase-scrypt';
import { timingSafeEqual } from 'node:crypto';

export async function verifyLegacyPassword(password, account, config) {
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024 ||
      account?.disabled || typeof account?.passwordHash !== 'string' || !account.passwordHash ||
      typeof account?.salt !== 'string' || config?.algorithm !== 'SCRYPT') return false;
  // Bound expensive legacy hashing; unsupported configuration must fail closed.
  if (!Number.isInteger(config.memoryCost) || config.memoryCost < 1 || config.memoryCost > 14 ||
      !Number.isInteger(config.rounds) || config.rounds < 1 || config.rounds > 8 ||
      typeof config.signerKey !== 'string' || !config.signerKey || typeof config.saltSeparator !== 'string') return false;
  try {
    const verifier = new FirebaseScrypt({ memCost: config.memoryCost, rounds: config.rounds,
      signerKey: config.signerKey, saltSeparator: config.saltSeparator });
    const actual = Buffer.from(await verifier.hash(password, account.salt), 'base64');
    const expected = Buffer.from(account.passwordHash, 'base64');
    return expected.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
