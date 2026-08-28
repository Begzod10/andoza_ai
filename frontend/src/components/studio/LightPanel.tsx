/**
 * Chiroqlar panel — pick a fixture, drop it in, tune it.
 *
 * Two halves, in the order the job is actually done: a palette of fixture
 * types on top, and the settings for whichever light is selected underneath.
 * Adding a fixture selects it immediately, so a fresh light always opens with
 * its own settings showing rather than making the user hunt for them.
 *
 * Every setting is an override that starts *absent*: a light the user never
 * touched keeps following the catalog default, and "Tiklash" removes the
 * override rather than writing the current value back.
 */
import * as React from 'react'
import { nanoid } from 'nanoid'
import { useRoomStore } from '@/store/roomStore'
import type { PlacedLight } from '@/store/roomStore'
import { roomExtents } from '@/lib/roomDims'
import {
  LIGHT_TYPES,
  LIGHT_LIMITS,
  lightType,
  kelvinToHex,
  type LightType,
  type LightTypeId,
} from '@/lib/lightCatalog'

/** Kelvin presets, named the way lamp boxes name them. */
const WHITE_PRESETS: Array<{ k: number; label: string }> = [
  { k: 2700, label: 'Issiq' },
  { k: 3000, label: 'Yumshoq' },
  { k: 4000, label: 'Neytral' },
  { k: 5000, label: 'Kunduzgi' },
  { k: 6500, label: 'Sovuq' },
]

export function LightPanel({ selectedId, onSelect, armedType, onArm, planMode }: {
  /** Light currently selected in the 3D viewport, if any. */
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  /** Fixture armed for placement in the 2D plan. */
  armedType?: LightTypeId | null
  onArm?: (id: LightTypeId | null) => void
  /** True when a 2D plan is on screen to click into. Without one there is
   *  nowhere to aim, so the palette drops the fixture at room centre instead. */
  planMode?: boolean
}) {
  const lights = useRoomStore((s) => s.lights)
  const geometry = useRoomStore((s) => s.geometry)
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight)
  const addLight = useRoomStore((s) => s.addLight)
  const updateLight = useRoomStore((s) => s.updateLight)
  const removeLight = useRoomStore((s) => s.removeLight)
  const clearLights = useRoomStore((s) => s.clearLights)

  // Fall back to internal selection when the page doesn't drive it
  const [ownSelection, setOwnSelection] = React.useState<string | null>(null)
  const activeId = selectedId !== undefined ? selectedId : ownSelection
  const select = React.useCallback((id: string | null) => {
    setOwnSelection(id)
    onSelect?.(id)
  }, [onSelect])

  const selected = lights.find((l) => l.id === activeId) ?? null

  /**
   * With the plan on screen, picking a type arms it and the user clicks the
   * exact spot — placing it blind at room centre would just mean dragging it
   * off centre every time. Clicking the armed type again disarms it.
   */
  function pick(type: LightType) {
    if (planMode) {
      onArm?.(armedType === type.id ? null : type.id)
      return
    }
    place(type)
  }

  function place(type: LightType) {
    const { W, D } = roomExtents(geometry)
    // Drop it in the middle of the room; dragging in the 3D view moves it.
    // Nudge each new fixture off the last so a stack of them stays clickable.
    const nth = lights.length
    const jitter = (nth % 4) * 250
    const light: PlacedLight = {
      id: nanoid(),
      type: type.id,
      xMm: Math.round((W * 1000) / 2 + jitter - 375),
      zMm: Math.round((D * 1000) / 2 + (nth % 3) * 250 - 250),
      ...(type.mount === 'wall' ? { wallId: 'A' as const } : {}),
    }
    addLight(light)
    select(light.id)
  }

  return (
    <div className="space-y-3">
      {/* ── Fixture palette ─────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Chiroq qo'shish
        </p>
        {planMode && (
          <p className="text-[10px] text-gray-400 leading-snug mb-2">
            {armedType
              ? "Endi 2D rejada aniq joyni bosing."
              : "Turini tanlang, so'ng 2D rejada joyni bosing."}
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {LIGHT_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              title={t.hint}
              className={`flex flex-col items-start text-left p-2 rounded-xl border-2 transition-colors ${
                armedType === t.id
                  ? 'border-brand bg-brand/10 ring-2 ring-brand/25'
                  : 'border-gray-200 bg-white hover:border-brand/50 hover:bg-brand/[0.03]'
              }`}
            >
              <span className="text-lg leading-none">{t.emoji}</span>
              <span className="mt-1 text-[11px] font-semibold text-gray-800 leading-tight">{t.name}</span>
              <span className="text-[9px] text-gray-400 leading-tight">
                {t.lumens} lm · {t.colorK}K
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Placed lights ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            Xonadagi chiroqlar ({lights.length})
          </p>
          {lights.length > 0 && (
            <button
              onClick={() => { clearLights(); select(null) }}
              className="text-[10px] font-semibold text-red-500 hover:text-red-600"
            >
              Hammasini o'chirish
            </button>
          )}
        </div>

        {lights.length === 0 ? (
          <p className="text-[11px] text-gray-400 leading-snug">
            {planMode
              ? "Hali chiroq yo'q. Yuqoridan turini tanlang, so'ng 2D rejada aniq joyni bosing."
              : "Hali chiroq yo'q. Yuqoridan turini tanlang — chiroq xona markaziga qo'yiladi, keyin 3D'da sudrab joyiga suring."}
          </p>
        ) : (
          <div className="space-y-1">
            {lights.map((l, i) => {
              const t = lightType(l.type)
              const isActive = l.id === activeId
              return (
                <button
                  key={l.id}
                  onClick={() => select(isActive ? null : l.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                    isActive
                      ? 'border-brand bg-brand/5'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <span className="text-sm leading-none">{t.emoji}</span>
                  <span className="flex-1 text-left text-[11px] font-medium text-gray-800 truncate">
                    {t.name} {i + 1}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                    style={{
                      background: kelvinToHex(l.colorK ?? t.colorK),
                      opacity: l.off ? 0.25 : 1,
                    }}
                  />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Settings for the selected fixture ───────────────────────── */}
      {selected && (
        <LightSettings
          light={selected}
          ceilingHeight={ceilingHeight}
          onPatch={(patch) => updateLight(selected.id, patch)}
          onDelete={() => { removeLight(selected.id); select(null) }}
        />
      )}
    </div>
  )
}

function LightSettings({ light, ceilingHeight, onPatch, onDelete }: {
  light: PlacedLight
  ceilingHeight: number
  onPatch: (patch: Partial<Omit<PlacedLight, 'id'>>) => void
  onDelete: () => void
}) {
  const t = lightType(light.type)
  const brightness = light.brightnessPct ?? 100
  const colorK = light.colorK ?? t.colorK
  const beamDeg = light.beamDeg ?? t.beamDeg

  return (
    <div className="rounded-xl border-2 border-brand/30 bg-brand/[0.03] p-2.5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{t.emoji}</span>
        <span className="flex-1 text-[12px] font-bold text-gray-900">{t.name}</span>
        <button
          onClick={() => onPatch({ off: !light.off })}
          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
            light.off
              ? 'bg-gray-200 text-gray-500'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {light.off ? "O'chiq" : 'Yoqilgan'}
        </button>
      </div>

      {t.hint && <p className="text-[10px] text-gray-400 leading-snug">{t.hint}</p>}

      <Slider
        label="Yorqinlik"
        value={brightness}
        display={`${brightness}%`}
        {...LIGHT_LIMITS.brightnessPct}
        onChange={(v) => onPatch({ brightnessPct: v })}
        onReset={light.brightnessPct === undefined ? undefined : () => onPatch({ brightnessPct: undefined })}
      />

      {/* Colour temperature — presets first, slider for anything between */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-gray-500">Rang harorati</span>
          <span className="text-[10px] font-mono text-gray-400">{colorK}K</span>
        </div>
        <div className="flex gap-1 mb-1.5">
          {WHITE_PRESETS.map((p) => (
            <button
              key={p.k}
              onClick={() => onPatch({ colorK: p.k })}
              title={`${p.label} · ${p.k}K`}
              className={`flex-1 h-6 rounded-md border-2 transition-all ${
                colorK === p.k ? 'border-brand scale-105' : 'border-black/10 hover:border-black/25'
              }`}
              style={{ background: kelvinToHex(p.k) }}
            />
          ))}
        </div>
        <input
          type="range"
          className="w-full accent-brand"
          value={colorK}
          min={LIGHT_LIMITS.colorK.min}
          max={LIGHT_LIMITS.colorK.max}
          step={LIGHT_LIMITS.colorK.step}
          onChange={(e) => onPatch({ colorK: Number(e.target.value) })}
        />
      </div>

      {beamDeg !== undefined && (
        <Slider
          label="Nur burchagi"
          value={beamDeg}
          display={`${beamDeg}°`}
          {...LIGHT_LIMITS.beamDeg}
          onChange={(v) => onPatch({ beamDeg: v })}
          onReset={light.beamDeg === undefined ? undefined : () => onPatch({ beamDeg: undefined })}
        />
      )}

      {/* Where it hangs / how high it sits — only for fixtures it applies to */}
      {(t.mount === 'ceiling' || t.mount === 'track') && (
        <Slider
          label="Osilish balandligi"
          value={light.dropM ?? t.dropM ?? 0}
          display={`${(light.dropM ?? t.dropM ?? 0).toFixed(2)} m`}
          min={LIGHT_LIMITS.dropM.min}
          max={Math.min(LIGHT_LIMITS.dropM.max, Math.max(0.1, ceilingHeight - 0.4))}
          step={LIGHT_LIMITS.dropM.step}
          onChange={(v) => onPatch({ dropM: v })}
          onReset={light.dropM === undefined ? undefined : () => onPatch({ dropM: undefined })}
        />
      )}

      {t.mount === 'wall' && (
        <Slider
          label="Devordagi balandlik"
          value={light.wallHM ?? t.wallHM ?? 1.8}
          display={`${(light.wallHM ?? t.wallHM ?? 1.8).toFixed(2)} m`}
          min={LIGHT_LIMITS.wallHM.min}
          max={Math.min(LIGHT_LIMITS.wallHM.max, Math.max(0.4, ceilingHeight - 0.2))}
          step={LIGHT_LIMITS.wallHM.step}
          onChange={(v) => onPatch({ wallHM: v })}
          onReset={light.wallHM === undefined ? undefined : () => onPatch({ wallHM: undefined })}
        />
      )}

      {t.mount === 'wall' && (
        <div>
          <span className="text-[10px] font-semibold text-gray-500 block mb-1">Devor</span>
          <div className="flex gap-1">
            {(['A', 'B', 'C', 'D'] as const).map((w) => (
              <button
                key={w}
                onClick={() => onPatch({ wallId: w })}
                className={`flex-1 py-1 rounded-md text-[10px] font-bold border-2 transition-colors ${
                  (light.wallId ?? 'A') === w
                    ? 'border-brand bg-white text-brand'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}

      {t.aimable && (
        <Slider
          label="Burilish"
          value={Math.round(((light.rotation ?? 0) * 180) / Math.PI)}
          display={`${Math.round(((light.rotation ?? 0) * 180) / Math.PI)}°`}
          min={-180}
          max={180}
          step={5}
          onChange={(v) => onPatch({ rotation: (v * Math.PI) / 180 })}
          onReset={light.rotation === undefined ? undefined : () => onPatch({ rotation: undefined })}
        />
      )}

      {t.aimable && t.beamDeg !== undefined && (
        <Slider
          label="Egilish"
          value={Math.round(((light.tiltRad ?? 0) * 180) / Math.PI)}
          display={`${Math.round(((light.tiltRad ?? 0) * 180) / Math.PI)}°`}
          min={0}
          max={75}
          step={5}
          onChange={(v) => onPatch({ tiltRad: (v * Math.PI) / 180 })}
          onReset={light.tiltRad === undefined ? undefined : () => onPatch({ tiltRad: undefined })}
        />
      )}

      <button
        onClick={onDelete}
        className="w-full py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[11px] font-semibold hover:bg-red-100 transition-colors"
      >
        Chiroqni o'chirish
      </button>
    </div>
  )
}

function Slider({ label, value, display, min, max, step, onChange, onReset }: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  /** Present only when the value is an override that can be dropped. */
  onReset?: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-gray-500">{label}</span>
        <span className="flex items-center gap-1.5">
          {onReset && (
            <button
              onClick={onReset}
              title="Standart qiymatga qaytarish"
              className="text-[9px] font-semibold text-gray-400 hover:text-brand"
            >
              Tiklash
            </button>
          )}
          <span className="text-[10px] font-mono text-gray-400">{display}</span>
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-brand"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
