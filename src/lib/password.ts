import argon2 from "argon2";

/**
 * Password hashing with argon2id — a memory-hard algorithm resistant to
 * GPU/ASIC cracking. Parameters follow current OWASP guidance
 * (>= 19 MiB memory, 2 iterations). A per-hash random salt is generated
 * internally by argon2 and embedded in the encoded output.
 */
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash or verification error — treat as a non-match.
    return false;
  }
}
