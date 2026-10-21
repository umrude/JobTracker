// A fingerprint of a job's listing text, stored with each comparison, so
// editing the listing afterwards can show "the listing changed since this
// comparison". Pure and dependency-free (FNV-1a), since it only
// detects change; it isn't security-sensitive. Whitespace is collapsed
// first, so re-pasting the same listing with different line breaks isn't
// a change.

// Two 32-bit FNV-1a passes with different offsets, joined: 64 bits of
// fingerprint without BigInt (the build targets ES2017).
function fnv1a(bytes: Uint8Array, offset: number): string {
  let hash = offset;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export function listingHash(text: string | null | undefined): string | null {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized === "") return null;
  const bytes = new TextEncoder().encode(normalized);
  return fnv1a(bytes, 0x811c9dc5) + fnv1a(bytes, 0x050c5d1f);
}

// Whether a comparison was made against different listing text than the
// job has now. A comparison from before fingerprints existed (null) is
// unknown, so it shows no note.
export function listingChangedSince(comparisonHash: string | null, currentListing: string | null): boolean {
  return comparisonHash !== null && comparisonHash !== listingHash(currentListing);
}
