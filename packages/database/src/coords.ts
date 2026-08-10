/**
 * True when the pair is a plausible WGS84 coordinate. Radios do emit garbage —
 * one live advert carried lat 1238.87 — and a single such row poisons every
 * consumer that aggregates positions, so validate at every write path.
 */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}
