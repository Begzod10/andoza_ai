import * as React from "react"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { uz } from "@/locale/uz"
import { aiDesign } from "@/lib/api"
import type { AiDesignPlan } from "@/lib/api"
import { useRoomStore } from "@/store/roomStore"
import { ALL_PARTS, applyDesignPlan, restoreDesign, snapshotDesign } from "@/lib/aiDesign"
import type { DesignParts, DesignSnapshot } from "@/lib/aiDesign"
import { lightType } from "@/lib/lightCatalog"
import { DESIGN_PRESETS, presetPlan } from "@/lib/aiDesignPresets"

interface AiBuilderSheetProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** Saves the room. Given, a design is saved the moment it is applied; absent, the person is told to save. */
  onSave?: () => Promise<void>
  roomId: string
  /** The room's kind (mehmonxona, yotoqxona...), so the pieces made for it are offered first. */
  roomType?: string
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
  return uz.ai.xato
}

export function zoneLabel(zone: string): string {
  if (zone === "center") return uz.ai.markaz
  if (zone.startsWith("wall_")) return `${zone.slice(5)} ${uz.ai.chetki_devor}`
  if (zone.startsWith("corner_")) {
    const rest = zone.slice(7)
    // corner_<a>_<b>; the old four-wall spelling is corner_AB.
    const [a, b] = rest.includes("_") ? rest.split("_") : [rest.slice(0, 1), rest.slice(1)]
    return `${a}–${b} ${uz.ai.burchak}`
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

export function AiBuilderSheet({ open, onOpenChange, onSave, roomId, roomType }: AiBuilderSheetProps) {
  const [prompt, setPrompt] = React.useState("")
  const [running, setRunning] = React.useState(false)
  const [plan, setPlan] = React.useState<AiDesignPlan | null>(null)
  const [parts, setParts] = React.useState<DesignParts>(ALL_PARTS)
  const [error, setError] = React.useState("")
  const [notice, setNotice] = React.useState("")
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
    const applied = applyDesignPlan(next, nextParts, catalogFurniture)
    const extra = applied.skipped > 0 ? ` ${uz.ai.sigmadi(applied.skipped)}` : ""
    if (!onSaveRef.current) {
      setNotice(uz.ai.qollandi_saqlang + extra)
      return
    }
    setNotice(uz.ai.saqlanmoqda)
    setNotice(((await persist()) ? uz.ai.qollandi_saqlandi : uz.ai.qollandi_saqlanmadi) + extra)
  }

  async function generate(e?: React.FormEvent) {
    e?.preventDefault()
    if (prompt.trim().length < 3 || running) return
    setRunning(true)
    setError("")
    setNotice("")
    let next: AiDesignPlan
    try {
      next = await aiDesign(roomId, prompt.trim(), roomType)
    } catch (err) {
      setPlan(null)
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
    const next = presetPlan(id, catalogFurniture, roomType, wallIds ? wallIds.split('|') : undefined)
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
    if (!onSaveRef.current) {
      setNotice(uz.ai.qaytarildi)
      return
    }
    setNotice(uz.ai.saqlanmoqda)
    setNotice((await persist()) ? uz.ai.qaytarildi_saqlandi : uz.ai.qaytarildi_saqlanmadi)
  }

  function close() {
    onOpenChange(false)
  }

  const lightNames = plan?.lights.map((l) => `${lightType(l.type).name} (${zoneLabel(l.zone)})`) ?? []
  const main = plan?.walls.main

  return (
    <>
    <BottomSheet open={open} onOpenChange={close} title={uz.ai.builder_title} defaultSnap="full">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4 pb-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500">{uz.ai.tayyor_uslublar}</p>
          <div className="flex flex-wrap gap-1.5">
            {DESIGN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => void usePreset(preset.id)}
                className="rounded-full bg-[#3B63DE]/10 px-3.5 py-1.5 text-xs font-semibold text-[#2F55D4] hover:bg-[#3B63DE]/20"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={generate} className="space-y-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={uz.ai.builder_placeholder}
            disabled={running}
            rows={3}
            maxLength={500}
            aria-label={uz.ai.dizayn_tavsifi}
            className="w-full resize-none rounded-2xl bg-soft px-3 py-2 text-sm shadow-soft-pressed focus:outline-none focus:shadow-soft-pressed-deep disabled:opacity-60"
          />
          <p className="pt-1 text-xs font-semibold text-gray-500">{uz.ai.ai_namunalari}</p>
          <div className="flex flex-wrap gap-1.5">
            {uz.ai.dizayner_misollar.map((example) => (
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
            disabled={running || prompt.trim().length < 3}
            className="w-full rounded-full bg-gradient-to-br from-[#6C87F2] to-[#3B63DE] py-3 text-sm font-semibold text-white shadow-soft-accent transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] active:scale-[0.97] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {running ? uz.ai.oylayapti : plan ? uz.ai.boshqa_variant : uz.ai.dizayn_yarat}
          </button>
        </form>

        {error && !running && (
          <div role="alert" className="space-y-1">
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-xs text-gray-600">{uz.ai.ai_ishlamadi_uslub}</p>
          </div>
        )}

        {plan && !running && (
          <section className="space-y-3" aria-label={plan.title}>
            <div className="rounded-2xl bg-blue-50 px-4 py-3">
              <h3 className="text-base font-bold text-gray-900">{plan.title}</h3>
              <p className="mt-1 text-sm leading-snug text-gray-700">{plan.summary}</p>
            </div>

            <PartRow id="walls" title={uz.ai.qism_devor} enabled={!!main} checked={parts.walls} onChange={(on) => changeParts({ ...parts, walls: on })}>
              {main?.type === "paint" && <Swatch color={main.color} label={main.color} />}
              {main?.type === "oboy" && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>Oboy: {main.pattern}</span>
                  <Swatch color={main.base_color} />
                  <Swatch color={main.accent_color} />
                </span>
              )}
              {plan.walls.accent && (
                <span className="ml-3 inline-flex items-center gap-1.5">
                  {plan.walls.accent.wall} {uz.ai.chetki_devor}: <Swatch color={plan.walls.accent.color} />
                </span>
              )}
            </PartRow>

            <PartRow id="floor" title={uz.ai.qism_pol} enabled={!!plan.floor} checked={parts.floor} onChange={(on) => changeParts({ ...parts, floor: on })}>
              {plan.floor && (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span>{plan.floor.type}{plan.floor.pattern ? ` · ${plan.floor.pattern}` : ""}</span>
                  {plan.floor.tint && <Swatch color={plan.floor.tint} />}
                </span>
              )}
            </PartRow>

            <PartRow id="lights" title={uz.ai.qism_chiroq} enabled={lightNames.length > 0} checked={parts.lights} onChange={(on) => changeParts({ ...parts, lights: on })}>
              {lightNames.join(", ")}
            </PartRow>

            <PartRow id="furniture" title={uz.ai.qism_mebel} enabled={plan.furniture.length > 0} checked={parts.furniture} onChange={(on) => changeParts({ ...parts, furniture: on })}>
              {plan.furniture.map((f) => `${f.name} (${zoneLabel(f.zone)})`).join(", ")}
            </PartRow>

            {plan.furniture.length === 0 && <p className="text-[11px] leading-snug text-gray-500">{uz.ai.mebel_topilmadi}</p>}
            <p className="text-[11px] leading-snug text-gray-500">{uz.ai.izoh_qoshimcha}</p>

            {undo && (
              <button
                type="button"
                onClick={() => void revert()}
                className="w-full rounded-full border-2 border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:border-[#3B63DE]"
              >
                {uz.ai.qaytarish}
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
          <p className="truncate text-sm font-bold text-gray-900">{plan?.title ?? uz.ai.qollandi_sarlavha}</p>
          <p className="text-xs leading-snug text-gray-600">{notice}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => void revert()} className="rounded-full px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100">
          {uz.ai.qaytarish}
        </button>
        <button type="button" onClick={() => onOpenChange(true)} className="rounded-full bg-[#3B63DE]/10 px-3 py-1.5 text-xs font-semibold text-[#2F55D4] hover:bg-[#3B63DE]/20">
          {uz.ai.batafsil}
        </button>
        <button type="button" onClick={() => setBarHidden(true)} aria-label={uz.common.yopish} className="px-1 text-gray-400 hover:text-gray-700">✕</button>
        </div>
      </div>
    )}
    </>
  )
}
