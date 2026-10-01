import { useEffect, useRef, useState } from "react";
import { createPhotoModel, fetchPhotoModelGlb, waitForRender } from "@/lib/api";
import { errorMessage } from "@/pages/dokon/admin/errorMessage";

const MAX_THUMB_BYTES = 5 * 1024 * 1024; // the server's cap on a model's preview picture
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // what Tripo accepts

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
 * Shared by the seller's and the admin's upload dialogs. Leaving (the dialog
 * closing) cancels the wait.
 */
export function PhotoToModelField({
  onBuilt,
  onBusyChange,
  onError,
}: {
  onBuilt: (built: BuiltFromPhoto) => void;
  /** True while a model is being built — the form should not submit meanwhile. */
  onBusyChange?: (busy: boolean) => void;
  /** A message when it fails or the photo is refused; null when a new attempt starts. */
  onError: (message: string | null) => void;
}) {
  const [building, setBuilding] = useState(false);
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

  async function build(photo: File) {
    onError(null);
    if (photo.size > MAX_PHOTO_BYTES) {
      onError("Rasm 20 MB dan kichik bo'lishi kerak");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const { job_id } = await createPhotoModel(photo);
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

  return (
    <div className="rounded-xl border border-dashed border-neutral-300 p-3 space-y-2">
      <label className="block text-sm font-medium text-neutral-900">Faylingiz yo'qmi? Rasmdan yarating</label>
      <p className="text-xs text-neutral-500">
        Mebelning aniq rasmini yuklang (toza fon yaxshi) — 3D model avtomatik yaratiladi, taxminan 1–2 daqiqa.
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
      {building && (
        <p role="status" className="flex items-center gap-2 text-xs font-medium text-brand">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/20 border-t-brand" aria-hidden />
          Model yaratilmoqda (1–2 daqiqa)...
        </p>
      )}
    </div>
  );
}
