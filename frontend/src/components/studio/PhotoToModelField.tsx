import { useEffect, useRef, useState } from "react";
import { createPhotoModel, fetchPhotoModelGlb, waitForRender } from "@/lib/api";
import type { PhotoViews } from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

const MAX_THUMB_BYTES = 5 * 1024 * 1024; // the server's cap on a model's preview picture
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // what Tripo accepts

type ViewKey = "front" | "left" | "back" | "right";
const VIEW_SLOTS: { key: ViewKey; label: string }[] = [
  { key: "front", label: "Old tomondan (majburiy)" },
  { key: "left", label: "Chap tomondan" },
  { key: "back", label: "Orqa tomondan" },
  { key: "right", label: "O'ng tomondan" },
];

export interface BuiltFromPhoto {
  /** The generated 3D model, ready to upload like a hand-picked .glb. */
  file: File;
  /** The photo, as the model's preview picture — null if it is too big to upload as one. */
  thumbnail: File | null;
  /** The photo's name without its extension, to suggest as the model's name. */
  baseName: string;
}

/**
 * "No 3D file, but a photo": the server builds the model with Tripo (1–2 minutes,
 * POST /models/from-photo) and the result is handed back as a File, so the form
 * previews, names and uploads it exactly as it would a file the person picked.
 *
 * Two ways in: ONE photo (the sides and back are guessed), or SEVERAL — the front
 * plus any of left / back / right — which the server builds together, so the
 * details match on every side. The choice picks the Tripo endpoint.
 *
 * Shared by the seller's and the admin's upload dialogs. Leaving (the dialog
 * closing) cancels the wait.
 */
export function PhotoToModelField({
  onBuilt,
  onBusyChange,
  themed = false,
  onError,
  title = "Faylingiz yo'qmi? Rasmdan yarating",
}: {
  onBuilt: (built: BuiltFromPhoto) => void;
  /** True while a model is being built — the form should not submit meanwhile. */
  onBusyChange?: (busy: boolean) => void;
  /** A message when it fails or the photo is refused; null when a new attempt starts. */
  onError: (message: string | null) => void;
  /** The heading; the sellers' dialog makes the photo the main way in. */
  title?: string;
  /** Follow the app's day/night theme (inside a themed dialog). */
  themed?: boolean;
}) {
  const [building, setBuilding] = useState(false);
  const [mode, setMode] = useState<"one" | "many">("one");
  const [slots, setSlots] = useState<Record<ViewKey, File | null>>({ front: null, left: null, back: null, right: null });
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;

  function setBusy(busy: boolean) {
    busyRef.current = busy;
    setBuilding(busy);
    onBusyRef.current?.(busy);
  }

  useEffect(() => () => {
    abortRef.current?.abort();
    if (busyRef.current) onBusyRef.current?.(false); // the parent must not stay locked
  }, []);

  async function build(photo: File, views: PhotoViews = {}) {
    onError(null);
    if ([photo, ...Object.values(views)].some((f) => f && f.size > MAX_PHOTO_BYTES)) {
      onError("Rasm 20 MB dan kichik bo'lishi kerak");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const { job_id } = await createPhotoModel(photo, views);
      const outcome = await waitForRender(job_id, controller.signal);
      const glb = await fetchPhotoModelGlb(outcome.key);
      const baseName = photo.name.replace(/\.[^.]+$/, "") || "model";
      onBuilt({
        file: new File([glb], `${baseName}.glb`, { type: "model/gltf-binary" }),
        thumbnail: photo.size <= MAX_THUMB_BYTES ? photo : null,
        baseName,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      onError(errorMessage(err, "Modelni yaratib bo'lmadi"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const chosen = Object.values(slots).filter(Boolean).length;
  const canBuildMany = !!slots.front && chosen >= 2;

  return (
    <div className={`rounded-xl border border-dashed p-3 space-y-2 ${themed ? "border-line" : "border-neutral-300"}`}>
      <label className={`block text-sm font-medium ${themed ? "text-ink" : "text-neutral-900"}`}>{title}</label>
      <div role="radiogroup" aria-label="Rasmlar soni" className={`grid grid-cols-2 gap-1 rounded-xl p-1 ${themed ? "bg-card-soft" : "bg-neutral-100"}`}>
        {([["one", "1 ta rasm"], ["many", "Bir nechta rasm"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            disabled={building}
            onClick={() => setMode(key)}
            className={`min-h-[34px] rounded-lg text-xs font-semibold transition disabled:opacity-60 ${
              mode === key ? (themed ? "bg-card text-ink shadow-sm" : "bg-white text-brand shadow-sm") : themed ? "text-ink-muted" : "text-neutral-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "one" ? (
        <>
          <p className={`text-xs ${themed ? "text-ink-muted" : "text-neutral-500"}`}>
            Mebelning aniq rasmini yuklang (toza fon yaxshi) — yon va orqa tomonlari taxminan chiziladi. Taxminan 1–2 daqiqa.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Rasmdan 3D model yaratish"
            disabled={building}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void build(f);
            }}
            className="text-xs w-full"
          />
        </>
      ) : (
        <>
          <p className={`text-xs ${themed ? "text-ink-muted" : "text-neutral-500"}`}>
            Bitta mebelning turli tomondan rasmlari (bir xil yorug'lik, toza fon). Old tomon majburiy, yana kamida bittasi kerak —
            rasm qancha ko'p bo'lsa, detallar shuncha aniq chiqadi.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {VIEW_SLOTS.map(({ key, label }) => (
              <label key={key} className={`block text-xs ${themed ? "text-ink" : "text-neutral-700"}`}>
                <span className="block mb-0.5 font-medium">{label}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={label}
                  disabled={building}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setSlots((prev) => ({ ...prev, [key]: f }));
                  }}
                  className="text-xs w-full"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={building || !canBuildMany}
            onClick={() => {
              const { front, left, back, right } = slots;
              const views: PhotoViews = {};
              if (left) views.left = left;
              if (back) views.back = back;
              if (right) views.right = right;
              if (front) void build(front, views);
            }}
            className="min-h-[40px] w-full rounded-lg bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {chosen} ta rasmdan 3D model yaratish
          </button>
        </>
      )}
      {building && (
        <p role="status" className="flex items-center gap-2 text-xs font-medium text-brand">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/20 border-t-brand" aria-hidden />
          Model yaratilmoqda (1–2 daqiqa)...
        </p>
      )}
    </div>
  );
}
