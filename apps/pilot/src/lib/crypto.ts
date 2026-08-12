import crypto from "crypto";

const ENV_KEY = process.env.ENCRYPTION_KEY;

if (!ENV_KEY && process.env.NODE_ENV === "production") {
  throw new Error(
    "ENCRYPTION_KEY is required in production — refusing to start with a non-persistent key",
  );
}

const ENCRYPTION_KEY = ENV_KEY
  ? Buffer.from(ENV_KEY, "hex")
  : crypto.randomBytes(32);

if (!ENV_KEY) {
  console.warn("[crypto] ENCRYPTION_KEY not set — using random key (won't survive restart)");
}

const ALGO = "aes-256-gcm";

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${encrypted.toString("hex")}.${tag.toString("hex")}`;
}

export function decryptSecret(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try {
    const [ivHex, encHex, tagHex] = ciphertext.split(".");
    if (!ivHex || !encHex || !tagHex) return null;
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
