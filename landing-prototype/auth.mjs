import {randomBytes, scrypt as deriveCallback, timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";

const derive = promisify(deriveCallback);
const options = {N:16384, r:8, p:1};

export async function hashPassword(password) {
  const salt = randomBytes(32);
  const key = await derive(password, salt, 64, options);
  return ["scrypt", "16384", "8", "1", salt.toString("base64url"), key.toString("base64url")].join("$");
}

export function validPasswordHash(encoded) {
  if (typeof encoded !== "string") return false;
  const parts = encoded.split("$");
  return parts.length === 6 && parts.slice(0, 4).join("$") === "scrypt$16384$8$1"
    && Buffer.from(parts[4], "base64url").length === 32
    && Buffer.from(parts[5], "base64url").length === 64;
}

export async function verifyPassword(password, encoded) {
  if (!validPasswordHash(encoded)) return false;
  const parts = encoded.split("$");
  const key = await derive(password, Buffer.from(parts[4], "base64url"), 64, options);
  return timingSafeEqual(key, Buffer.from(parts[5], "base64url"));
}
