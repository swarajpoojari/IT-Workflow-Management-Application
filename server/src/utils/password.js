import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPasswordSync = (plain) => bcrypt.hashSync(plain, ROUNDS);
export const verifyPasswordSync = (plain, hash) => bcrypt.compareSync(plain, hash);

export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Unambiguous alphabet: no O/0, I/l/1. An admin reads this aloud or copies it
// out of the UI once, so look-alike characters are a real cost.
const SAFE_UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const SAFE_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const SAFE_DIGIT = '23456789';

/**
 * A temporary password that satisfies the login policy (>= 8 chars, a letter
 * and a digit) by construction, formatted in two readable blocks.
 */
export function generateTemporaryPassword() {
  const pick = (alphabet, count) =>
    Array.from(randomBytes(count))
      .map((byte) => alphabet[byte % alphabet.length])
      .join('');

  const left = pick(SAFE_UPPER, 1) + pick(SAFE_LOWER, 3);
  const right = pick(SAFE_DIGIT, 2) + pick(SAFE_LOWER, 2);
  return `${left}-${right}`;
}
