import * as React from "react"
import { ImagePlus } from "lucide-react"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { aiDesign, aiDesignFromImage, aiDesignFromPin, findPinUrl, looksLikePinUrl } from "@/lib/api"
import type { AiDesignPlan } from "@/lib/api"
import { useRoomStore } from "@/store/roomStore"
import { ALL_PARTS, applyDesignPlan, restoreDesign, snapshotDesign } from "@/lib/aiDesign"
import type { AppliedCounts, DesignParts, DesignSnapshot } from "@/lib/aiDesign"
import { lightType } from "@/lib/lightCatalog"
import { DESIGN_PRESETS, presetPlan, roomSizeOf } from "@/lib/aiDesignPresets"
import { summaryWithout } from "@/lib/aiSummary"
import { ceilingDesign } from "@/lib/ceilingDesigns"
import { effectiveRoomType } from "@/lib/roomType"
import { RoomTypePicker } from "./RoomTypePicker"
import { trimLabel, trimProfileDef } from "@/lib/trimProfiles"

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

interface AiBuilderSheetProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** Saves the room. Given, a design is saved the moment it is applied; absent, the person is told to save. */
  onSave?: () => Promise<void>
  roomId: string
  /** The room's kind (mehmonxona, yotoqxona...), so the pieces made for it are offered first. */
  roomType?: string
  /** A Pinterest pin to start from, e.g. one shared to the mobile app (`?ai_pin=`). */
  initialPinUrl?: string | null
}

/** The server answers errors as {"detail": "..."}; apiClient throws the raw body. */
function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : ""
  try {
    const detail = JSON.parse(raw)?.detail
    if (typeof detail === "string") return detail
  } catch {
    /* not JSON */
  }
  return i18n.t("ai.xato")
}

export function zoneLabel(zone: string): string {
  if (zone === "center") return i18n.t("ai.markaz")
  if (zone.startsWith("wall_")) return `${zone.slice(5)} ${i18n.t("ai.chetki_devor")}`
  if (zone.startsWith("corner_")) {
    const rest = zone.slice(7)
    // corner_<a>_<b>; the old four-wall spelling is corner_AB.
    const [a, b] = rest.includes("_") ? rest.split("_") : [rest.slice(0, 1), rest.slice(1)]
    return `${a}–${b} ${i18n.t("ai.burchak")}`
  }
  return zone
}

function Swatch({ color, label }: { color: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: color }} aria-hidden="true" />
      {label && <span className="text-xs text-gray-600">{label}</span>}
    </span>
  )
}

function PartRow({
  id, title, enabled, checked, onChange, children,
}: {
  id: keyof DesignParts; title: string; enabled: boolean; checked: boolean
  onChange(on: boolean): void; children: React.ReactNode
}) {
  return (
    <label
      htmlFor={`ai-part-${id}`}
      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
        enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-50"
      }`}
    >
      <input
        id={`ai-part-${id}`}
        type="checkbox"
        checked={enabled && checked}
        disabled={!enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[#3B63DE]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-gray-600">{children}</span>
      </span>
    </label>
  )
}

export function AiBuilderSheet({ open, onOpenChange, onSave, roomId, roomType: roomTypeProp, initialPinUrl }: AiBuilderSheetProps) {
  const { t } = useTranslation()
  // The picker below changes the room's kind; the next request, preset or layout uses the new one.
  const pickedType = useRoomStore((s) => s.roomType)
  const roomName = useRoomStore((s) => s.name)
  // The room's own kind, else the one the studio guessed, else the guess from its name.
  const roomType = effectiveRoomType(pickedType ?? roomTypeProp, roomName)
  const [prompt, setPrompt] = React.useState("")
  // An inspiration image, kept until the user removes it, so "Boshqa variant" asks again with it.
  const [image, setImage] = React.useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [imageError, setImageError] = React.useState("")
  // A Pinterest pin link: the other inspiration source. One source at a time.
  const [pinUrl, setPinUrl] = React.useState<string | null>(initialPinUrl ?? null)
  const [pinInput, setPinInput] = React.useState("")
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [running, setRunning] = React.useState(false)
  const [plan, setPlan] = React.useState<AiDesignPlan | null>(null)
  const [parts, setParts] = React.useState<DesignParts>(ALL_PARTS)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
  // What the last design really put in the room: what did not fit, what stood in for what, and what was
  // placed. It stays under the summary while the design does (the notice line moves on).
  const [applied, setApplied] = React.useState<AppliedCounts | null>(null)
  // The room as it was before this session's AI design: what "Qaytarish" goes back to, and what a new
  // variant starts from, so variants replace one another instead of piling up.
  const [undo, setUndo] = React.useState<DesignSnapshot | null>(null)
  const [barHidden, setBarHidden] = React.useState(false)
  const onSaveRef = React.useRef(onSave)
  onSaveRef.current = onSave
  // Saves go one after another: a second design applied while the first is still being saved must not be skipped.
  const saveChain = React.useRef<Promise<unknown>>(Promise.resolve())
  const catalogFurniture = useRoomStore((s) => s.catalogFurniture)
  const wallIds = useRoomStore((s) => s.geometry.walls.map((w) => w.id).join('|'))

  /** Saves the room; true when it did (the studio clears its unsaved mark only on success). */
  function persist(): Promise<boolean> {
    if (!onSaveRef.current) return Promise.resolve(false)
    const run = saveChain.current.then(() => onSaveRef.current?.())
    saveChain.current = run.catch(() => undefined)
    return run.then(() => !useRoomStore.getState().isDirty, () => false)
  }

  /**
   * Puts a plan into the room, starting from how the room was before any AI design this session, and
   * saves it. The design is seen at once and kept; undoing it is one tap.
   */
  async function commit(next: AiDesignPlan, nextParts: DesignParts) {
    const base = undo ?? snapshotDesign()
    if (undo) restoreDesign(undo)
    setUndo(base)
    setBarHidden(false)
    const applied = applyDesignPlan(next, nextParts, catalogFurniture, roomType)
    setApplied(applied)
    // What did not fit is named under the summary, where it stays: not in the status line too.
    if (!onSaveRef.current) {
      setNotice(t("ai.qollandi_saqlang"))
      return
    }
    setNotice(t("ai.saqlanmoqda"))
    setNotice((await persist()) ? t("ai.qollandi_saqlandi") : t("ai.qollandi_saqlanmadi"))
  }

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function pickImage(file: File | undefined) {
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) { setImageError(t("ai.rasm_turi_xato")); return }
    if (file.size > MAX_IMAGE_BYTES) { setImageError(t("ai.rasm_hajmi_xato")); return }
    setImageError("")
    setPinUrl(null)
    setImage(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function takePin(text: string) {
    removeImage()
    setImageError("")
    setPinInput("")
    setPinUrl(text.trim())
  }

  /** The link is taken when it is complete: pasted, or left with blur / Enter. Checking
   *  on every keystroke took "https://www.pinterest.c" mid-typing and kept it truncated. */
  function commitPinInput(text: string = pinInput) {
    if (!text.trim()) return
    if (looksLikePinUrl(text)) takePin(text)
    else setImageError(t("ai.pin_xato"))
  }

  function pastePin(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text")
    const text = findPinUrl(pasted) ?? pasted
    setPinInput(text)
    commitPinInput(text)
  }

  /** A pin link pasted into the prompt box is meant as the source, not as words. */
  function pastePrompt(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const found = findPinUrl(e.clipboardData.getData("text"))
    if (!found) return
    e.preventDefault()
    takePin(found)
  }

  function removeImage() {
    setImage(null)
    setPreviewUrl(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  const canSend = !running && (pinUrl !== null || image !== null || prompt.trim().length >= 3)

  async function generate(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSend) return
    setRunning(true)
    setError("")
    setNotice("")
    let next: AiDesignPlan
    try {
      next = pinUrl
        ? await aiDesignFromPin(roomId, pinUrl, prompt.trim(), roomType)
        : image
          ? await aiDesignFromImage(roomId, image, prompt.trim(), roomType)
          : await aiDesign(roomId, prompt.trim(), roomType)
    } catch (err) {
      setPlan(null)
      setApplied(null)
      setError(errorText(err))
      return
    } finally {
      setRunning(false)
    }
    const nextParts = {
      walls: !!next.walls.main, floor: !!next.floor, lights: next.lights.length > 0, furniture: next.furniture.length > 0,
    }
    setPlan(next)
    setParts(nextParts)
    close() // the sheet covers and dims the room: show the design
    await commit(next, nextParts)
  }

  /** A ready-made style: no request, so it works with the AI down and costs nothing. */
  async function usePreset(id: string) {
    // The bed is picked to fit the room's size, read as the backend reads it for the AI.
    const roomSize = roomSizeOf(useRoomStore.getState().geometry)
    const next = presetPlan(id, catalogFurniture, roomType, wallIds ? wallIds.split('|') : undefined, roomSize)
    if (!next) return
    setError("")
    const nextParts = { walls: true, floor: true, lights: true, furniture: next.furniture.length > 0 }
    setPlan(next)
    setParts(nextParts)
    close()
    await commit(next, nextParts)
  }

  /** Switching a part on or off shows the change at once, and keeps it saved. */
  function changeParts(next: DesignParts) {
    setParts(next)
    if (plan && undo) void commit(plan, next)
  }

  async function revert() {
    if (!undo) return
    restoreDesign(undo)
    setUndo(null)
    setPlan(null)
    setApplied(null)
    if (!onSaveRef.current) {
      setNotice(t("ai.qaytarildi"))
      return
    }
    setNotice(t("ai.saqlanmoqda"))
    setNotice((await persist()) ? t("ai.qaytarildi_saqlandi") : t("ai.qaytarildi_saqlanmadi"))
  }

  function close() {
    onOpenChange(false)
  }

  const countedNames = (list: Array<{ name: string; count: number }>) =>
    list.map(({ name, count }) => t("ai.dropped_item", { name, count })).join(", ")
  // The furniture as placed, once it is in the room; the plan's own list while it is switched off.
  const furnitureLine = applied && parts.furniture
    ? countedNames(applied.placed)
    : plan?.furniture.map((f) => f.zone ? `${f.name} (${zoneLabel(f.zone)})` : f.name).join(", ")
  const lightNames = plan?.lights.map((l) => `${t(lightType(l.type).nameKey)} (${zoneLabel(l.zone)})`) ?? []
  const main = plan?.walls.main
  // The ceiling and the cornice the plan sets; an AI plan may name only some of them (or only the
  // skirting, which is not listed), and then nothing or less is shown.
  const trim = plan?.trim
  const trimLine = trim
    ? [
        trim.ceiling && `${t("ai.shift_label")}: ${t(ceilingDesign(trim.ceiling.design).labelKey)}`,
        trim.cornice === undefined
          ? null
          : trim.cornice
            ? `${t("ai.galtel_label")} ${trimLabel(trimProfileDef(trim.cornice.id, "cornice"))}`
            : t("ai.galtel_yoq"),
      ].filter(Boolean).join(", ")
    : ""

  return (
    <>
    <BottomSheet open={open} onOpenChange={close} title={t("ai.builder_title")} defaultSnap="full">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4 pb-4">
        <RoomTypePicker roomId={roomId} fallback={roomTypeProp} disabled={running} />
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500">{t("ai.tayyor_uslublar")}</p>
          <div className="flex flex-wrap gap-1.5">
            {DESIGN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => void usePreset(preset.id)}
                className="rounded-full bg-[#3B63DE]/10 px-3.5 py-1.5 text-xs font-semibold text-[#2F55D4] hover:bg-[#3B63DE]/20"
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={generate} className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={pastePrompt}
            placeholder={image || pinUrl ? t("ai.rasm_placeholder") : t("ai.builder_placeholder")}
            disabled={running}
            rows={3}
            maxLength={500}
            aria-label={t("ai.dizayn_tavsifi")}
            className="w-full resize-none rounded-2xl bg-soft px-3 py-2 text-sm shadow-soft-pressed focus:outline-none focus:shadow-soft-pressed-deep disabled:opacity-60"
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_TYPES.join(",")}
              aria-label={t("ai.rasm_input")}
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={running}
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-[#3B63DE] hover:text-[#3B63DE] disabled:opacity-60"
            >
              <ImagePlus size={14} aria-hidden="true" />
              {t("ai.rasm_qoshish")}
            </button>
            {previewUrl && (
              <div className="relative">
                <img src={previewUrl} alt={t("ai.rasm_preview")} className="h-12 w-12 rounded-xl object-cover" />
                <button
                  type="button"
                  aria-label={t("ai.rasm_olib_tashlash")}
                  onClick={removeImage}
                  disabled={running}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] text-white"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          {pinUrl ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#E60023]/10 px-3 py-1.5 text-xs font-semibold text-[#B8001C]">{t("ai.pin_chip")}</span>
              <button
                type="button"
                aria-label={t("ai.pin_olib_tashlash")}
                onClick={() => setPinUrl(null)}
                disabled={running}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[10px] text-white"
              >
                ✕
              </button>
            </div>
          ) : (
            <input
              type="url"
              value={pinInput}
              onChange={(e) => { setPinInput(e.target.value); setImageError("") }}
              onPaste={pastePin}
              onBlur={() => commitPinInput()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPinInput() } }}
              placeholder={t("ai.pin_placeholder")}
              aria-label={t("ai.pin_label")}
              disabled={running}
              className="w-full rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#3B63DE]/40"
            />
          )}
          {imageError && <p role="alert" className="text-xs text-red-600">{imageError}</p>}
          <p className="pt-1 text-xs font-semibold text-gray-500">{t("ai.ai_namunalari")}</p>
          <div className="flex flex-wrap gap-1.5">
            {t("ai.dizayner_misollar", { returnObjects: true }).map((example) => (
              <button
                key={example}
                type="button"
                disabled={running}
                onClick={() => setPrompt(example)}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-[#3B63DE] hover:text-[#3B63DE] disabled:opacity-60"
              >
                {example}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={!canSend}
            className="w-full rounded-full bg-gradient-to-br from-[#6C87F2] to-[#3B63DE] py-3 text-sm font-semibold text-white shadow-soft-accent transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] active:scale-[0.97] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {running ? t("ai.oylayapti") : plan ? t("ai.boshqa_variant") : pinUrl ? t("ai.pindan_yarat") : image ? t("ai.rasmdan_yarat") : t("ai.dizayn_yarat")}
          </button>
        </form>

        {error && !running && (
          <div role="alert" className="space-y-1">
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-xs text-gray-600">{t("ai.ai_ishlamadi_uslub")}</p>
          </div>
        )}

        {plan && !running && (
          <section className="space-y-3" aria-label={plan.title}>
            <div className="rounded-2xl bg-blue-50 px-4 py-3">
              <h3 className="text-base font-bold text-gray-900">{plan.title}</h3>
              {/* Told before the layout: a sentence about a piece that did not fit would describe a room that is not there. */}
              <p className="mt-1 text-sm leading-snug text-gray-700">{applied ? summaryWithout(plan.summary, applied.dropped, [...applied.placed.map((p) => p.name), ...applied.swapped.map((s) => s.from)]) : plan.summary}</p>
              {plan.image_notes && <p className="mt-2 text-xs leading-snug text-gray-600">{plan.image_notes}</p>}
              {applied && applied.dropped.length > 0 && (
                <p className="mt-2 text-xs leading-snug text-amber-800">{t("ai.joy_yetmadi_royxat", { list: countedNames(applied.dropped) })}</p>
              )}
              {applied?.swapped.map(({ from, to, count }) => (
                <p key={`${from}|${to}`} className="mt-1 text-xs leading-snug text-gray-600">
                  {t("ai.orniga_qoyildi", { from: t("ai.dropped_item", { name: from, count }), to })}
                </p>
              ))}
              {plan.pin_image_url && (
                <img src={plan.pin_image_url} alt={t("ai.pin_asosida")} title={t("ai.pin_asosida")} className="mt-2 h-20 rounded-xl object-cover" />
              )}
            </div>

            <PartRow id="walls" title={plan.trim ? t("ai.qism_devor_shift") : t("ai.qism_devor")} enabled={!!main} checked={parts.walls} onChange={(on) => changeParts({ ...parts, walls: on })}>
              {main?.type === "paint" && <Swatch color={main.color} label={main.color} />}
              {main?.type === "oboy" && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{t("studio.radial.oboy")}: {main.pattern}</span>
                  <Swatch color={main.base_color} />
                  <Swatch color={main.accent_color} />
                </span>
              )}
              {plan.walls.accent && (
                <span className="ml-3 inline-flex items-center gap-1.5">
                  {plan.walls.accent.wall} {t("ai.chetki_devor")}: <Swatch color={plan.walls.accent.color} />
                </span>
              )}
              {trimLine && <span className="mt-1 block text-xs text-gray-600">{trimLine}</span>}
            </PartRow>

            <PartRow id="floor" title={t("ai.qism_pol")} enabled={!!plan.floor} checked={parts.floor} onChange={(on) => changeParts({ ...parts, floor: on })}>
              {plan.floor && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{plan.floor.type}{plan.floor.pattern ? ` · ${plan.floor.pattern}` : ""}</span>
                  {plan.floor.tint && <Swatch color={plan.floor.tint} />}
                </span>
              )}
            </PartRow>

            <PartRow id="lights" title={t("ai.qism_chiroq")} enabled={lightNames.length > 0} checked={parts.lights} onChange={(on) => changeParts({ ...parts, lights: on })}>
              {lightNames.join(", ")}
            </PartRow>

            <PartRow id="furniture" title={t("ai.qism_mebel")} enabled={plan.furniture.length > 0} checked={parts.furniture} onChange={(on) => changeParts({ ...parts, furniture: on })}>
              {furnitureLine}
            </PartRow>

            {plan.furniture.length === 0 && <p className="text-[11px] leading-snug text-gray-500">{t("ai.mebel_topilmadi")}</p>}
            <p className="text-[11px] leading-snug text-gray-500">{t("ai.izoh_qoshimcha")}</p>

            {undo && (
              <button
                type="button"
                onClick={() => void revert()}
                className="w-full rounded-full border-2 border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:border-[#3B63DE]"
              >
                {t("ai.qaytarish")}
              </button>
            )}
          </section>
        )}

        {notice && <p role="status" className="text-sm font-medium text-green-700">{notice}</p>}
      </div>
    </BottomSheet>

    {/* With the sheet closed the design is on screen; this says what was done and keeps undo within reach. */}
    {!open && undo && !barHidden && (
      <div
        role="status"
        className="fixed bottom-24 left-1/2 z-30 flex w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-lg"
      >
        {/* The message is what says whether it was saved: it wraps rather than being cut, and on a narrow
            screen the buttons drop to a row of their own. */}
        <div className="min-w-0 flex-1 basis-[11rem]">
          <p className="truncate text-sm font-bold text-gray-900">{plan?.title ?? t("ai.qollandi_sarlavha")}</p>
          <p className="text-xs leading-snug text-gray-600">{notice}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => void revert()} className="rounded-full px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">
          {t("ai.qaytarish")}
        </button>
        <button type="button" onClick={() => onOpenChange(true)} className="rounded-full bg-[#3B63DE]/10 px-3 py-1.5 text-xs font-semibold text-[#2F55D4] hover:bg-[#3B63DE]/20">
          {t("ai.batafsil")}
        </button>
        <button type="button" onClick={() => setBarHidden(true)} aria-label={t("common.yopish")} className="px-1 text-gray-400 hover:text-gray-700">✕</button>
        </div>
      </div>
    )}
    </>
  )
}
