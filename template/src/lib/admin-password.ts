import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLEL = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, KEY_LENGTH,
    { N: COST, r: BLOCK_SIZE, p: PARALLEL }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const key = await derive(password, salt);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLEL}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, costText, blockText, parallelText, saltText, keyText] = parts;
  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallel = Number(parallelText);
  if (cost !== COST || blockSize !== BLOCK_SIZE || parallel !== PARALLEL) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(keyText, "base64url");
  if (salt.length !== 32 || expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
