import type { Part } from './model'

/** Rounds to 0.1 mm, the precision a cut size is given in. */
export function round01(x: number): number {
  return Math.round(x * 10) / 10
}

const band = (side: Part['edges'][keyof Part['edges']]) => side?.thickness ?? 0

/**
 * The size the saw cuts so the part reaches its finished size once banded:
 * each banded side takes its band thickness off. The L sides run along the
 * length, so they shorten the width; the W sides shorten the length. A
 * pre-milling edgebander removes that material itself, so nothing is taken off.
 */
export function cutSize(
  finished: { length: number; width: number },
  edges: Part['edges'],
  premilled: boolean,
): { length: number; width: number } {
  if (premilled) return { ...finished }
  return {
    length: round01(finished.length - band(edges.W1) - band(edges.W2)),
    width: round01(finished.width - band(edges.L1) - band(edges.L2)),
  }
}
