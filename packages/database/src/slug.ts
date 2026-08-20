import { randomBytes } from "node:crypto";

const SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SLUG_LENGTH = 6;

const SLUG_PATTERN = /^[a-z0-9]{5,8}$/;

export function generatePathSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let slug = "";
  for (const byte of bytes) {
    slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  }
  return slug;
}

export function isPathSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
