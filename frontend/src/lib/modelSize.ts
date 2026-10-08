/** A model's real size in centimetres, as the studio will draw it. */
export interface MeasuredSize {
  width_cm: number;
  depth_cm: number;
  height_cm: number;
}

/** The largest size the catalog stores (its columns hold up to 999.99 cm). */
const MAX_CM = 999;

/** What the server stores of a measured model; nothing when it could not be measured or is out of range. */
export function sizeFields(size: MeasuredSize | null): { footprint_w?: number; footprint_d?: number; height_cm?: number } {
  if (!size) return {};
  const ok = [size.width_cm, size.depth_cm, size.height_cm].every((v) => Number.isFinite(v) && v > 0 && v <= MAX_CM);
  return ok ? { footprint_w: size.width_cm, footprint_d: size.depth_cm, height_cm: size.height_cm } : {};
}

/** "210 × 90 × 85 sm": width, depth and height, as a person reads them. */
export function describeSize(size: MeasuredSize): string {
  const n = (v: number) => String(Math.round(v));
  return `${n(size.width_cm)} × ${n(size.depth_cm)} × ${n(size.height_cm)} sm`;
}
