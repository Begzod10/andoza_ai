import i18n, { type TKey } from '@/i18n'

/**
 * The wall paint palette.
 *
 * Lives here rather than in WallSection because the surface ring offers the
 * same colours: two lists would drift, and a colour in one but not the other
 * is a colour the user can reach from one place and not the other.
 */
// Five interior palettes the user supplied (a dark anchor plus its warm or
// cool neutrals in each), sampled from their reference sheet and laid out in
// the same order. The swatches carry no visible labels — the names below are
// only what a screen reader or a hover tooltip announces.
export const WALL_COLORS = [
  // Olive green & warm beige
  "#6D6A41", "#D5C1A6", "#E7DAC9", "#C3A279",
  // Dusty blue & soft grey
  "#677882", "#B9B6AF", "#E8E0D5", "#BEAF9C",
  // Emerald green & light neutral
  "#1A4228", "#D6C2A9", "#EAE1D2", "#A6A47D",
  // Terracotta & warm neutral
  "#A85F32", "#D7C5AD", "#8F7755",
  // Navy blue & gold
  "#1A2835", "#E7DDD1", "#C9C0B7", "#C39243",
];

// Locale keys of the names of the swatches above — without these, screen readers and
// colorblind users have no way to tell the buttons apart.
export const WALL_COLOR_NAMES: Record<string, TKey> = {
  "#6D6A41": "studio.lib.wall_color.6d6a41",
  "#D5C1A6": "studio.lib.wall_color.d5c1a6",
  "#E7DAC9": "studio.lib.wall_color.e7dac9",
  "#C3A279": "studio.lib.wall_color.c3a279",
  "#677882": "studio.lib.wall_color.677882",
  "#B9B6AF": "studio.lib.wall_color.b9b6af",
  "#E8E0D5": "studio.lib.wall_color.e8e0d5",
  "#BEAF9C": "studio.lib.wall_color.beaf9c",
  "#1A4228": "studio.lib.wall_color.1a4228",
  "#D6C2A9": "studio.lib.wall_color.d6c2a9",
  "#EAE1D2": "studio.lib.wall_color.eae1d2",
  "#A6A47D": "studio.lib.wall_color.a6a47d",
  "#A85F32": "studio.lib.wall_color.a85f32",
  "#D7C5AD": "studio.lib.wall_color.d7c5ad",
  "#8F7755": "studio.lib.wall_color.8f7755",
  "#1A2835": "studio.lib.wall_color.1a2835",
  "#E7DDD1": "studio.lib.wall_color.e7ddd1",
  "#C9C0B7": "studio.lib.wall_color.c9c0b7",
  "#C39243": "studio.lib.wall_color.c39243",
};

/** The swatch's name in the current language (read at call time, not module load). */
export function wallColorName(hex: string): string {
  const key = WALL_COLOR_NAMES[hex]
  return key ? i18n.t(key) : hex
}
