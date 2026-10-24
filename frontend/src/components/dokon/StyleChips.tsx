import { useTranslation } from "react-i18next";
import { FURNITURE_STYLES, type FurnitureStyle } from "@/lib/furnitureStyles";

/** Pick the design styles a model suits. None picked = it suits every style. */
export function StyleChips({
  value,
  onChange,
}: {
  value: FurnitureStyle[];
  onChange: (next: FurnitureStyle[]) => void;
}) {
  const { t } = useTranslation();

  function toggle(id: FurnitureStyle) {
    onChange(value.includes(id) ? value.filter((s) => s !== id) : [...value, id]);
  }

  return (
    <div>
      <span className="block text-sm font-medium text-ink mb-1.5">{t("dokon.model.styles")}</span>
      <div className="flex flex-wrap gap-2">
        {FURNITURE_STYLES.map(({ id, labelKey }) => {
          const on = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(id)}
              className={`min-h-[40px] rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                on ? "bg-brand text-white border-brand" : "border-line text-ink-muted hover:text-ink hover:border-ink-muted"
              }`}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>
      {value.length === 0 && <p className="mt-1.5 text-xs text-ink-muted">{t("dokon.model.all_styles")}</p>}
    </div>
  );
}
