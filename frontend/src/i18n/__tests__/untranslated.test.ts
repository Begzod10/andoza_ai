import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

// Files and folders (relative to the frontend root) whose texts all live in
// the locale files. Each migration task adds the ones it finishes.
export const MIGRATED_DIRS: string[] = [
  "src/i18n",
  "src/components/smeta/CategorySection.tsx",
  "src/components/smeta/CostBreakdown.tsx",
  "src/components/smeta/SmetaAskDrawer.tsx",
  "src/components/studio/PanoramaViewer.tsx",
  "src/components/studio/RenderSheet.tsx",
  "src/pages/auth",
  "src/pages/profile",
  "src/components/layout",
  "src/components/ui",
  "src/pages/landing",
  "src/pages/LandingPage.tsx",
  "src/pages/PrivacyPage.tsx",
  "src/pages/DeleteAccountPage.tsx",
  "src/pages/share",
  "src/pages/scan",
  "src/pages/projects",
  "src/pages/wizard",
  "src/components/wizard",
  "src/pages/ustalar",
  "src/hooks",
  "src/pages/studio",
];

// Strings that may stay as literals: the brand, the language names, and
// symbols/abbreviations that are the same in every language.
export const ALLOW: string[] = [
  "andoza.ai", "andoza.ai v1.0.0", "O'zbekcha", "Русский", "English",
  "AndozaAI", "progress 0%" /* debug-only readout */, "4K", "PDF", "JPG, PNG, WEBP", "Username", "F", "Del", "Esc", "m²",
  // Keyboard keys and wiring labels that read the same in every language.
  "Shift", "ESC", "TV", "ETH", "ANT",
  // CSS in a <style> tag of the floor plan, not text.
  ".kbd-focusable:focus-visible { outline: 2px solid var(--color-primary, #1B3784); outline-offset: 2px; }",
];

const TEXT_ATTRIBUTES = new Set(["label", "placeholder", "title", "aria-label", "alt", "description"]);
// Calls whose string arguments (and title/description-like properties of an
// object argument) are shown to the user.
const MESSAGE_CALLS = new Set(["toast", "setError", "setNotice", "setImageError", "errorMessage", "confirm"]);
const MESSAGE_PROPERTIES = new Set(["title", "description", "confirmLabel", "cancelLabel"]);

const WORD = /\p{L}{2,}/u;

const root = resolve(__dirname, "../../..");

function sourceFiles(path: string): string[] {
  const abs = join(root, path);
  if (statSync(abs).isFile()) return /\.tsx?$/.test(abs) && !/\.(test|spec)\.tsx?$/.test(abs) && !abs.endsWith(".d.ts") ? [abs] : [];
  return readdirSync(abs).flatMap((name) => sourceFiles(join(path, name)));
}

/** The string literals a value can evaluate to directly (through ?:, ??, ||, &&). */
function literalsOf(node: ts.Node): ts.Node[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return literalsOf(node.expression);
  }
  if (ts.isTemplateExpression(node)) return [node];
  if (ts.isConditionalExpression(node)) return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return [...literalsOf(node.left), ...literalsOf(node.right)];
    }
  }
  return [];
}

function calleeNames(expression: ts.Expression): string[] {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) return [expression.name.text, ...calleeNames(expression.expression)];
  return [];
}

/** User-visible text that is not in the locale files: `file:line: text`. */
export function findUntranslated(source: string, fileName = "file.tsx"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, text: string) => {
    const value = text.replace(/\s+/g, " ").trim();
    if (!WORD.test(value) || ALLOW.includes(value)) return;
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    found.push(`${fileName}:${line + 1}: ${value}`);
  };
  const reportAll = (node: ts.Node) => {
    for (const literal of literalsOf(node)) {
      if (ts.isTemplateExpression(literal)) {
        // Only the fixed text around the `${}` holes is a literal.
        report(literal, literal.head.text);
        for (const span of literal.templateSpans) report(span, span.literal.text);
      } else report(literal, (literal as ts.StringLiteral).text);
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text);
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(file)) && node.initializer) {
      if (ts.isJsxExpression(node.initializer)) {
        if (node.initializer.expression) reportAll(node.initializer.expression);
      } else reportAll(node.initializer);
    }
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      reportAll(node.expression);
    }
    if (ts.isCallExpression(node) && calleeNames(node.expression).some((name) => MESSAGE_CALLS.has(name))) {
      for (const arg of node.arguments) {
        reportAll(arg);
        if (ts.isObjectLiteralExpression(arg)) {
          for (const property of arg.properties) {
            if (ts.isPropertyAssignment(property) && MESSAGE_PROPERTIES.has(property.name.getText(file))) {
              reportAll(property.initializer);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("findUntranslated", () => {
  it("finds a text node, an attribute, a ternary child and a message call", () => {
    const code = `
      function C({ ok, on }: { ok: boolean; on: boolean }) {
        return (
          <div className={on ? "flex gap-2" : "hidden"} title="Saqlash">
            Salom {ok ? "Ha" : t("x")}
          </div>
        )
      }
      setError("Xato yuz berdi")
    `;
    expect(findUntranslated(code)).toHaveLength(4);
  });

  it("ignores className ternaries, keys, calls to t() and allowed text", () => {
    const code = `
      const a = <div className={on ? "flex gap-2" : "hidden"} data-x="abc">
        <b>Del</b> {t("a.b")} <span aria-label={t("c")}>{n}</span> andoza.ai
      </div>
      setError(t("x"))
      toast({ variant: "error", title: t("y") })
    `;
    expect(findUntranslated(code)).toEqual([]);
  });

  it("checks ?? and || branches and title/description of toast and confirm", () => {
    const code = `
      const a = <input placeholder={x ?? "Qidirish"} label={y || "Nom"} />
      toast({ variant: "error", title: "Xato" })
      confirm({ title: ok ? "Ha" : "Yo'q", description: "Aniq" })
    `;
    expect(findUntranslated(code)).toHaveLength(6);
  });

  it("checks the fixed text of a template literal, not its holes", () => {
    expect(findUntranslated("setError(`Xato: ${m}`)")).toHaveLength(1);
    expect(findUntranslated("const a = <p className={`px-2 ${x}`} />")).toEqual([]);
    expect(findUntranslated("setError(`${a} va ${b}`)")).toHaveLength(1);
  });

  it("sees letters of any script", () => {
    expect(findUntranslated(`const a = <p>Привет</p>`)).toHaveLength(1);
  });
});

describe("migrated files hold no untranslated text", () => {
  for (const path of MIGRATED_DIRS) {
    it(path, () => {
      const offenders = sourceFiles(path).flatMap((file) =>
        findUntranslated(readFileSync(file, "utf8"), file.slice(root.length + 1)),
      );
      expect(offenders).toEqual([]);
    });
  }
});
