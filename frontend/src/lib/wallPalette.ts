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

// Uzbek names for the swatches below — without these, screen readers and
// colorblind users have no way to tell the buttons apart. Never rendered.
export const WALL_COLOR_NAMES: Record<string, string> = {
  "#6D6A41": "Zaytun yashil",
  "#D5C1A6": "Iliq bej",
  "#E7DAC9": "Krem",
  "#C3A279": "Sarg'ish jigarrang",
  "#677882": "Kulrang ko'k",
  "#B9B6AF": "Yumshoq kulrang",
  "#E8E0D5": "Oqish",
  "#BEAF9C": "Och taupe",
  "#1A4228": "Zumrad yashil",
  "#D6C2A9": "Och bej",
  "#EAE1D2": "Fil suyagi",
  "#A6A47D": "Shuvoq yashil",
  "#A85F32": "Terrakota",
  "#D7C5AD": "Qumli bej",
  "#8F7755": "Mokko",
  "#1A2835": "To'q ko'k",
  "#E7DDD1": "Nozik krem",
  "#C9C0B7": "Och kulrang",
  "#C39243": "Oltin",
};

export function wallColorName(hex: string): string {
  return WALL_COLOR_NAMES[hex] ?? hex
}
