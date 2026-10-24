import { describe, expect, it } from "vitest";
import uz from "../locales/uz.json";
import ru from "../locales/ru.json";
import en from "../locales/en.json";

type Leaf = string | string[];
const PLURAL = /_(zero|one|two|few|many|other)$/;

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, Leaf> {
  const out: Record<string, Leaf> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix + key;
    if (Array.isArray(value) && value.some((item) => typeof item === "object" && item !== null)) {
      // A list of objects (cards, tiers): each item's fields are compared by index.
      value.forEach((item, i) => Object.assign(out, flatten({ [i]: item }, `${path}.`)));
    } else if (typeof value === "string" || Array.isArray(value)) out[path] = value as Leaf;
    else Object.assign(out, flatten(value as Record<string, unknown>, `${path}.`));
  }
  return out;
}

const vars = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
const texts = (leaf: Leaf) => (Array.isArray(leaf) ? leaf : [leaf]);
const stem = (key: string) => key.replace(PLURAL, "");

const files = { uz: flatten(uz), ru: flatten(ru), en: flatten(en) };

// Plural forms differ per language (ru has few/many), so keys are compared by
// their plural-less stem; the per-language forms are checked separately.
const stems = (flat: Record<string, Leaf>) => [...new Set(Object.keys(flat).map(stem))].sort();

describe("locale files", () => {
  it("have the same keys in uz, ru and en", () => {
    expect(stems(files.ru)).toEqual(stems(files.uz));
    expect(stems(files.en)).toEqual(stems(files.uz));
  });

  it("have no empty values", () => {
    for (const [lang, flat] of Object.entries(files)) {
      for (const [key, leaf] of Object.entries(flat)) {
        for (const text of texts(leaf)) {
          expect(text.trim(), `${lang}:${key}`).not.toBe("");
        }
      }
    }
  });

  it("keep the same arrays lengths", () => {
    for (const [key, leaf] of Object.entries(files.uz)) {
      if (!Array.isArray(leaf)) continue;
      expect((files.ru[key] as string[]).length, `ru:${key}`).toBe(leaf.length);
      expect((files.en[key] as string[]).length, `en:${key}`).toBe(leaf.length);
    }
  });

  it("use the same {{variables}} as uz", () => {
    for (const lang of ["ru", "en"] as const) {
      for (const [key, leaf] of Object.entries(files[lang])) {
        const source = files.uz[key] ?? files.uz[`${stem(key)}_other`];
        expect(source, `${lang}:${key} has no uz source`).toBeDefined();
        const a = texts(leaf);
        const b = texts(source);
        a.forEach((text, i) => expect(vars(text), `${lang}:${key}[${i}]`).toEqual(vars(b[i])));
      }
    }
  });

  it("define every plural form the language needs", () => {
    for (const [lang, flat] of Object.entries(files)) {
      const categories = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
      const pluralStems = new Set(
        Object.keys(flat).filter((k) => PLURAL.test(k)).map(stem),
      );
      expect(pluralStems.size, `${lang} has plural keys`).toBeGreaterThan(0);
      for (const s of pluralStems) {
        for (const category of categories) {
          expect(flat, `${lang}:${s}_${category}`).toHaveProperty([`${s}_${category}`]);
        }
      }
    }
  });
});
