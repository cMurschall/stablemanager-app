const ITERATIONS = 100_000;

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a[i]! ^ b[i]!;
  }
  return out === 0;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algo, iterStr, saltHex, hashHex] = stored.split(":");
  if (algo !== "pbkdf2" || !iterStr || !saltHex || !hashHex) return false;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const salt = fromHex(saltHex);
  const expected = fromHex(hashHex);
  if (expected.length === 0) return false;
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
