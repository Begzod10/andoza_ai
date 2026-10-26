import { useTranslation } from "react-i18next";
import { Select } from "@/components/ui/Select";
import { MODEL_YAWS, type ModelYaw } from "@/lib/modelYaw";

/**
 * Which way an uploaded model faces: the turn found from its shape, which the admin or seller can
 * change when it guessed wrong (or found nothing, as for a round pouf).
 */
export function ModelFrontField({
  value,
  found,
  onChange,
}: {
  value: ModelYaw;
  /** The turn found from the model's shape; null when it has no clear back. */
  found: ModelYaw | null;
  onChange: (yaw: ModelYaw) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select themed
      label={t("models.front_label")}
      helperText={found === null ? t("models.front_none") : t("models.front_auto", { deg: found })}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as ModelYaw)}
    >
      {MODEL_YAWS.map((yaw) => (
        <option key={yaw} value={yaw}>{t("models.front_option", { deg: yaw })}</option>
      ))}
    </Select>
  );
}
