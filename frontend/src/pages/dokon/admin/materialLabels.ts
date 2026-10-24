import type { TFunction } from "i18next";
import type { LabelledOption, SmetaKeyOption } from "@/lib/api";

/** The translated label of an option, or its id when the server sent one this build does not know. */
export function optionLabel(list: LabelledOption[], id: string, t: TFunction): string {
  const option = list.find((x) => x.id === id);
  return option ? t(option.labelKey) : id;
}

/** "Suvoq", or "Chiroq: Osma chiroq" for a light fixture key. */
export function smetaKeyLabel(option: SmetaKeyOption, t: TFunction): string {
  return option.light ? t("dokon.admin.smeta_key.light", { name: t(option.labelKey) }) : t(option.labelKey);
}

export function smetaLabel(list: SmetaKeyOption[], id: string, t: TFunction): string {
  const option = list.find((x) => x.id === id);
  return option ? smetaKeyLabel(option, t) : id;
}
