import crypto from "node:crypto";

const ALGORITHM_PRIORITY = ["sha512", "sha384", "sha256", "sha1"] as const;

type SupportedAlgorithm = (typeof ALGORITHM_PRIORITY)[number];

interface IntegrityEntry {
  algorithm: SupportedAlgorithm;
  digest: string;
}

export function verifyIntegrity(buffer: Buffer, integrity: string): void {
  const entry = pickIntegrityEntry(integrity);
  if (!entry) {
    throw new Error("Unsupported integrity format");
  }

  const actual = crypto.createHash(entry.algorithm).update(buffer).digest("base64");
  const expected = entry.digest;

  if (!safeEqualBase64(actual, expected)) {
    throw new Error(`Integrity check failed for ${entry.algorithm}`);
  }
}

function pickIntegrityEntry(integrity: string): IntegrityEntry | null {
  const entries = integrity
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map(parseIntegrityEntry)
    .filter((entry) => entry !== null);

  return entries.sort(
    (a, b) => ALGORITHM_PRIORITY.indexOf(a.algorithm) - ALGORITHM_PRIORITY.indexOf(b.algorithm),
  )[0] ?? null;
}

function parseIntegrityEntry(value: string): IntegrityEntry | null {
  const [algorithm, digestWithOptions] = value.split("-", 2);
  const digest = digestWithOptions?.split("?")[0];

  if (!isSupportedAlgorithm(algorithm) || !digest) {
    return null;
  }

  return {
    algorithm,
    digest,
  };
}

function isSupportedAlgorithm(value: string): value is SupportedAlgorithm {
  return ALGORITHM_PRIORITY.includes(value as SupportedAlgorithm);
}

function safeEqualBase64(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
