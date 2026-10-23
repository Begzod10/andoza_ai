import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// Files and folders (relative to the frontend root) whose texts all live in
// the locale files. Each migration task adds the folders it moves.
export const MIGRATED_DIRS: string[] = [
  "src/i18n",
  "src/components/smeta/CategorySection.tsx",
  "src/components/smeta/CostBreakdown.tsx",
  "src/components/smeta/SmetaAskDrawer.tsx",
  "src/components/studio/AiBuilderSheet.tsx",
  "src/components/studio/DesignPanel.tsx",
  "src/components/studio/PanoramaViewer.tsx",
  "src/components/studio/RenderSheet.tsx",
  "src/components/studio/design-panel/FloorSection.tsx",
  "src/components/studio/design-panel/WallFloorTargetPanel.tsx",
  "src/components/studio/design-panel/WallSection.tsx",
  "src/pages/auth/LoginPage.tsx",
  "src/pages/profile/ProfilePage.tsx",
  "src/pages/smeta/SmetaPage.tsx",
  "src/pages/studio/IsometricPage.tsx",
  "src/pages/studio/StudioPage.tsx",
  "src/pages/studio/ThreeDPage.tsx",
  "src/pages/studio/three-d/QiblaMarker.tsx",
  "src/pages/studio/three-d/ToolsDrawerPanel.tsx",
  "src/pages/ustalar/UstalarPage.tsx",
];

// Texts that may stay as literals (brand, language names).
export const ALLOW: string[] = ["andoza.ai", "O'zbekcha", "Русский", "English"];

// Uzbek letter combinations (o' g' o‘ g‘ oʻ gʻ) and a few function words.
const UZBEK = /\b\w*(?:o['‘ʻ’]|g['‘ʻ’])\w*\b|\b(?:va|uchun|bilan|qilish|yo'q)\b/i;
const ATTR = "label|placeholder|title|aria-label|alt";

const root = resolve(__dirname, "../../..");

function sourceFiles(path: string): string[] {
  const abs = join(root, path);
  if (statSync(abs).isFile()) return /\.tsx$/.test(abs) && !/\.test\.tsx$/.test(abs) ? [abs] : [];
  return readdirSync(abs).flatMap((name) => {
    const rel = join(path, name);
    return statSync(join(root, rel)).isDirectory() ? sourceFiles(rel) : sourceFiles(rel);
  });
}

/** JSX text nodes and the string literals of the listed attributes. */
export function visibleTexts(source: string): string[] {
  const found: string[] = [];
  // JSX text: between a tag end (`>`) or an expression end (`}`) and the next
  // tag or expression, with no code characters in it. `=>` and `->` are not
  // tag ends.
  for (const m of source.matchAll(/(?:(?<![=\-])>|\})([^<>{}=;&|()*`]*[A-Za-z][^<>{}=;&|()*`]*)[<{]/g)) found.push(m[1].trim());
  // attr="text" / attr='text'
  for (const m of source.matchAll(new RegExp(`\\b(?:${ATTR})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g"))) {
    found.push(m[1] ?? m[2]);
  }
  // attr={ ... "text" ... } on one line: only the string literals count.
  for (const m of source.matchAll(new RegExp(`\\b(?:${ATTR})\\s*=\\s*\\{([^}\\n]*)\\}`, "g"))) {
    for (const s of m[1].matchAll(/"([^"]*)"|'([^']*)'|`([^`$]*)`/g)) found.push(s[1] ?? s[2] ?? s[3]);
  }
  return found;
}

describe("visibleTexts", () => {
  it("finds JSX text and attribute literals, not code", () => {
    const code = `
      const f = (a: number) => a > 1 ? "g'oya" : "x";
      <p title="Saqlash" className="x">Yo'q <b>{n}</b></p>
      <input placeholder={ok ? "Qidirish" : t("a")} aria-label='Yopish' />
    `;
    const texts = visibleTexts(code);
    expect(texts).toEqual(expect.arrayContaining(["Yo'q", "Saqlash", "Qidirish", "Yopish"]));
    expect(texts).not.toContain("g'oya");
  });
});

describe("migrated files hold no Uzbek text", () => {
  for (const path of MIGRATED_DIRS) {
    it(path, () => {
      const offenders: string[] = [];
      for (const file of sourceFiles(path)) {
        for (const text of visibleTexts(readFileSync(file, "utf8"))) {
          if (ALLOW.includes(text)) continue;
          if (UZBEK.test(text)) offenders.push(`${file.slice(root.length + 1)}: ${text}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
