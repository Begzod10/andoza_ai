import { useAppThemeAttribute } from '@/hooks/useAppThemeAttribute'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useRoomStore,
  computeFloorArea,
  computeNetWallArea,
  computePerimeter,
  computeOpeningsCount,
} from '@/store/roomStore'
import type { RoomGeometry, Wall, WallElement } from '@/store/roomStore'
import { IsometricRoomPreview } from '@/components/wizard/IsometricRoomPreview'
import { WallElevationPreview } from '@/components/wizard/WallElevationPreview'
import { MetricCard } from '@/components/ui/MetricCard'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { createApartment, createRoom, createDraftRoom, getDraftRoom, updateDraftRoom, deleteDraftRoom, updateRoom } from '@/lib/api'
import { wallElementsToApiPositions } from '@/lib/wallPositions'
import { cn, formatDecimal } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import type { TFunction } from 'i18next'
import { RoomTypePicker } from '@/components/studio/RoomTypePicker'
import { guessRoomType } from '@/lib/roomType'

// ─── Constants ────────────────────────────────────────────────────────────────

// TOTAL_STEPS is dynamic: geometry.walls.length + 2 (ceiling + N walls + results)

const CEILING_PRESETS = [2.5, 2.7, 3.0, 3.2]

interface ElementPreset {
  type: 'eshik' | 'deraza' | 'balkon'
  labelKey: 'wizard.eshik' | 'wizard.deraza' | 'wizard.balkon'
  defaultWidth: number   // mm
  defaultHeight: number  // mm
  defaultSill: number    // mm
}

const ELEMENT_PRESETS: ElementPreset[] = [
  { type: 'eshik',  labelKey: 'wizard.eshik',   defaultWidth: 900,  defaultHeight: 2050, defaultSill: 0 },
  { type: 'deraza', labelKey: 'wizard.deraza',  defaultWidth: 1400, defaultHeight: 1400, defaultSill: 900 },
  { type: 'balkon', labelKey: 'wizard.balkon',  defaultWidth: 750,  defaultHeight: 2050, defaultSill: 0 },
]

// ─── Step transition variants ─────────────────────────────────────────────────

const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -40 : 40,
    opacity: 0,
  }),
}

const stepTransition = { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }

// ─── Wall step label ──────────────────────────────────────────────────────────

function wallStepLabel(t: TFunction, wall: { id: string }, idx: number): string {
  const defaultIds = ['A', 'B', 'C', 'D']
  return t('wizard.devor_nomi', { id: defaultIds[idx] ?? wall.id })
}

// ─── Element chip ─────────────────────────────────────────────────────────────

interface ElementChipProps {
  element: WallElement
  wallLengthMm: number
  onRemove(): void
  onPositionChange(positionMm: number): void
}

function ElementChip({ element, wallLengthMm, onRemove, onPositionChange }: ElementChipProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = React.useState(false)

  const labelMap = { eshik: t('wizard.eshik'), deraza: t('wizard.deraza'), balkon: t('wizard.balkon') } as const

  // Resolve display position (centered when 0)
  const resolvedPos = element.position > 0
    ? element.position
    : Math.max(0, Math.round((wallLengthMm - element.width) / 2))

  const leftM = resolvedPos / 1000
  const rightM = (wallLengthMm - resolvedPos - element.width) / 1000
  const maxPos = wallLengthMm - element.width

  function handleLeft(raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v)) {
      const mm = Math.round(Math.max(0, Math.min(v * 1000, maxPos)))
      onPositionChange(mm)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-card-soft overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-1 px-3 py-1.5">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 text-left text-xs font-medium text-ink flex items-center gap-1.5"
        >
          <span className={`text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          {labelMap[element.type]} {formatDecimal(element.width / 1000, 2)}×{formatDecimal(element.height / 1000, 2)}{t('wizard.metr')}
        </button>
        <button onClick={onRemove} aria-label={t('common.ochirish')} className="text-ink-muted hover:text-red-400 transition-colors text-xs leading-none">✕</button>
      </div>

      {/* Position controls */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-line">
          <p className="text-[10px] text-ink-muted pt-2">{t('wizard.joylashuv')}</p>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={maxPos}
            step={10}
            value={resolvedPos}
            onChange={(e) => onPositionChange(parseInt(e.target.value))}
            className="w-full accent-brand"
          />

          {/* Left / right dimension inputs */}
          <div className="flex items-center gap-2 text-xs">
            <label className="flex-1">
              <span className="text-ink-muted block mb-0.5">{t('wizard.sol_m')}</span>
              <input
                type="number"
                value={leftM.toFixed(2)}
                min={0}
                max={(wallLengthMm - element.width) / 1000}
                step={0.05}
                onChange={(e) => handleLeft(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
            <div className="text-center text-ink-muted pt-4">{formatDecimal(element.width / 1000, 2)}{t('wizard.metr')}</div>
            <label className="flex-1">
              <span className="text-ink-muted block mb-0.5">{t('wizard.ong_m')}</span>
              <input
                type="number"
                readOnly
                value={Math.max(0, rightM).toFixed(2)}
                className="w-full rounded-lg border border-line bg-card px-2 py-1 text-ink-muted"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Add element sheet content ────────────────────────────────────────────────

interface AddElementSheetProps {
  onAdd(el: Omit<WallElement, 'id'>): void
  onClose(): void
}

function AddElementSheet({ onAdd, onClose }: AddElementSheetProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = React.useState<ElementPreset>(ELEMENT_PRESETS[0])
  const [w, setW] = React.useState(selected.defaultWidth / 1000)
  const [h, setH] = React.useState(selected.defaultHeight / 1000)
  const [sill, setSill] = React.useState(selected.defaultSill / 1000)

  function selectPreset(preset: ElementPreset) {
    setSelected(preset)
    setW(preset.defaultWidth / 1000)
    setH(preset.defaultHeight / 1000)
    setSill(preset.defaultSill / 1000)
  }

  function handleAdd() {
    onAdd({
      type: selected.type,
      width: Math.round(w * 1000),
      height: Math.round(h * 1000),
      sill_height: Math.round(sill * 1000),
      position: 0,
    })
    onClose()
  }

  return (
    <div className="pb-6 space-y-4">
      <h3 className="text-base font-bold text-neutral-900 pt-2">{t('wizard.element_qoshish')}</h3>

      {/* Type selector */}
      <div className="flex gap-2">
        {ELEMENT_PRESETS.map((p) => (
          <button
            key={p.type}
            onClick={() => selectPreset(p)}
            className={cn(
              'flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all',
              selected.type === p.type
                ? 'border-brand bg-primary/10 text-brand'
                : 'border-neutral-200 text-neutral-600 hover:border-brand/40',
            )}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {/* Dimension inputs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('wizard.kenglik_m'), val: w, set: setW, min: 0.3, max: 4 },
          { label: t('wizard.balandlik_m'), val: h, set: setH, min: 0.5, max: 3 },
          { label: t('wizard.osti_m'), val: sill, set: setSill, min: 0, max: 1.5 },
        ].map(({ label, val, set, min, max }) => (
          <label key={label} className="block">
            <span className="text-xs text-neutral-500">{label}</span>
            <input
              type="number"
              value={val}
              min={min}
              max={max}
              step={0.05}
              onChange={(e) => set(parseFloat(e.target.value) || min)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
        ))}
      </div>

      <button
        onClick={handleAdd}
        className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-brand/90 transition-colors"
      >
        {t('wizard.qoshish')}
      </button>
    </div>
  )
}

// ─── Step 0: Ceiling height ───────────────────────────────────────────────────

interface Step0Props {
  ceilingHeight: number
  onChange(h: number): void
  onNext(): void
  /** Whether the typed height can be used; the page holds "Keyingi" back
   *  while it cannot, instead of going on with the previous height. */
  onValidChange(valid: boolean): void
}

function Step0({ ceilingHeight, onChange, onNext, onValidChange }: Step0Props) {
  const { t } = useTranslation()
  const mVal = ceilingHeight / 1000
  const [inputVal, setInputVal] = React.useState(mVal.toFixed(2))

  function handlePreset(v: number) {
    onChange(Math.round(v * 1000))
    setInputVal(v.toFixed(2))
    onValidChange(true)
    onNext()
  }

  function handleInput(raw: string) {
    setInputVal(raw)
    const v = parseFloat(raw)
    const valid = !isNaN(v) && v >= 2.0 && v <= 4.0
    if (valid) onChange(Math.round(v * 1000))
    onValidChange(valid)
  }

  return (
    <div className="space-y-5">
      <RoomTypePicker />

      <div>
        <h1 className="text-2xl font-extrabold text-ink">{t('wizard.shift_balandligi')}</h1>
        <p className="text-sm text-muted mt-1">{t('wizard.shift_izoh')}</p>
      </div>

      {/* Preset chips */}
      <div className="flex gap-2 flex-wrap">
        {CEILING_PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => handlePreset(v)}
            className={cn(
              'rounded-full px-5 py-2.5 text-sm font-bold border transition-all',
              Math.round(v * 1000) === ceilingHeight
                ? 'border-transparent bg-gradient-to-br from-[#5B84F5] to-[#3D5FD6] text-white shadow-glow'
                : 'border-line bg-card-soft text-ink hover:border-[#5B84F5]/60',
            )}
          >
            {formatDecimal(v, 1)} {t('wizard.metr')}
          </button>
        ))}
      </div>

      {/* Numeric input */}
      <label className="block">
        <span className="text-sm font-medium text-ink">{t('wizard.aniq_qiymat')}</span>
        <input
          type="number"
          value={inputVal}
          min={2.0}
          max={4.0}
          step={0.01}
          onChange={(e) => handleInput(e.target.value)}
          className="mt-1 block w-full rounded-xl border border-line bg-card-soft px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {(parseFloat(inputVal) < 2.0 || parseFloat(inputVal) > 4.0) && !isNaN(parseFloat(inputVal)) && (
          <p className="mt-1 text-xs text-red-400">{t('wizard.shift_xato')}</p>
        )}
      </label>
    </div>
  )
}

// ─── Steps 1–4: Wall input ────────────────────────────────────────────────────

interface WallStepProps {
  wallIndex: number
  wall: Wall
  wallA: Wall
  ceilingHeight: number
  onLengthChange(wallId: string, mm: number): void
  onAddElement(wallId: string, el: Omit<WallElement, 'id'>): void
  onRemoveElement(wallId: string, elId: string): void
  onMoveElement(wallId: string, elId: string, positionMm: number): void
  onSwapElements(wallId: string): void
}

function WallStep({
  wallIndex,
  wall,
  wallA,
  ceilingHeight,
  onLengthChange,
  onAddElement,
  onRemoveElement,
  onMoveElement,
  onSwapElements,
}: WallStepProps) {
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [copyA, setCopyA] = React.useState(false)

  const isC = wall.id === 'C'
  const lenM = wall.length / 1000
  const label = wallStepLabel(t, wall, wallIndex)

  function handleSlider(v: number) {
    onLengthChange(wall.id, Math.round(v * 1000))
  }

  function handleInput(raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v) && v >= 1 && v <= 12) {
      onLengthChange(wall.id, Math.round(v * 1000))
    }
  }

  function handleCopyA(checked: boolean) {
    setCopyA(checked)
    if (checked) {
      onLengthChange(wall.id, wallA.length)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold text-ink">{label}</h2>
        <p className="text-sm text-muted mt-0.5">{t('wizard.uzunligini_kiriting')}</p>
      </div>

      <div className="rounded-2xl bg-[#F4F6FB] p-2">
        <WallElevationPreview
          wall={wall}
          ceilingHeight={ceilingHeight}
          wallLabel={label}
        />
      </div>

      {/* Length slider + input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">{t('wizard.uzunlik')}</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={lenM.toFixed(1)}
              min={1}
              max={12}
              step={0.1}
              disabled={isC && copyA}
              onChange={(e) => handleInput(e.target.value)}
              className="w-16 rounded-lg border border-line bg-card-soft px-2 py-1 text-sm text-right text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
            />
            <span className="text-sm text-muted">{t('wizard.metr')}</span>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={12}
          step={0.1}
          value={lenM}
          disabled={isC && copyA}
          onChange={(e) => handleSlider(parseFloat(e.target.value))}
          className="w-full accent-brand disabled:opacity-50"
        />
      </div>

      {/* Copy wall A checkbox (only for wall C) */}
      {isC && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={copyA}
            onChange={(e) => handleCopyA(e.target.checked)}
            className="w-4 h-4 accent-brand rounded"
          />
          <span className="text-sm text-ink">{t('wizard.a_bilan_bir_xil', { length: formatDecimal(wallA.length / 1000, 1) })}</span>
        </label>
      )}

      {/* Element chips */}
      {wall.elements.length > 0 && (
        <div className="flex flex-col gap-2">
          {wall.elements.map((el) => (
            <ElementChip
              key={el.id}
              element={el}
              wallLengthMm={wall.length}
              onRemove={() => onRemoveElement(wall.id, el.id)}
              onPositionChange={(mm) => onMoveElement(wall.id, el.id, mm)}
            />
          ))}
          {wall.elements.length === 2 && (
            <button
              type="button"
              onClick={() => onSwapElements(wall.id)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-line py-2 text-xs text-ink-muted hover:border-brand hover:text-brand transition-colors"
            >
              {t('wizard.almashtirish')}
            </button>
          )}
        </div>
      )}

      {/* Add element button */}
      <button
        onClick={() => setSheetOpen(true)}
        className="flex items-center gap-2 rounded-full bg-card-soft px-4 py-2.5 text-sm font-bold text-accent transition-colors hover:bg-card-soft/70"
      >
        <span className="text-lg leading-none">+</span>
        {t('wizard.eshik_deraza_qoshish')}
      </button>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={t('wizard.element_qoshish')}
        defaultSnap="half"
      >
        <AddElementSheet
          onAdd={(el) => onAddElement(wall.id, el)}
          onClose={() => setSheetOpen(false)}
        />
      </BottomSheet>
    </div>
  )
}

// ─── Step 5: Results ──────────────────────────────────────────────────────────

interface Step5Props {
  roomId: string | null
  geometry: RoomGeometry
  ceilingHeight: number
  saving: boolean
  saveFailed: boolean
  onRetrySave(): void
  onNewRoom(): void
}

function Step5({ roomId, geometry, ceilingHeight, saving, saveFailed, onRetrySave, onNewRoom }: Step5Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const floorMm2 = computeFloorArea(geometry)
  const wallMm2 = computeNetWallArea(geometry, ceilingHeight)
  const perimMm = computePerimeter(geometry)
  const openings = computeOpeningsCount(geometry)

  return (
    <div className="space-y-5">
      {/* Success animation */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="flex justify-center"
      >
        <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
          <svg className="w-8 h-8 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </motion.div>

      <div className="text-center">
        <h2 className="text-xl font-extrabold text-ink">{saveFailed ? t('wizard.olchamlar_tayyor') : t('wizard.olchamlar_saqlandi')}</h2>
        <p className="text-sm text-muted mt-1">
          {saveFailed ? t('wizard.xona_yozilmadi') : t('wizard.xona_qayd')}
        </p>
      </div>

      {/* Metric cards 2×2 */}
      <motion.div
        className="grid grid-cols-2 gap-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.12 } },
        }}
      >
        {[
          { label: t('wizard.pol_maydoni'), value: floorMm2 / 1e6, unit: t('common.m2'), decimals: 1 },
          { label: t('wizard.devor_maydoni'), value: wallMm2 / 1e6, unit: t('common.m2'), decimals: 1 },
          { label: t('wizard.perimetr'), value: perimMm / 1000, unit: t('wizard.metr'), decimals: 1 },
          { label: t('wizard.teshiklar'), value: openings, unit: t('wizard.birlik_ta'), decimals: 0 },
        ].map((card) => (
          <motion.div
            key={card.label}
            variants={{
              hidden: { y: 16, opacity: 0 },
              visible: { y: 0, opacity: 1, transition: { duration: 0.4 } },
            }}
          >
            <MetricCard
              label={card.label}
              value={card.value}
              unit={card.unit}
              decimals={card.decimals}
              themed
            />
          </motion.div>
        ))}
      </motion.div>

      {saveFailed && (
        <div role="alert" className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-ink">
          <p className="font-semibold">{t('wizard.saqlanmadi')}</p>
          <p className="mt-1 text-ink-muted">{t('wizard.saqlanmadi_izoh')}</p>
          <Button size="sm" className="mt-3" onClick={onRetrySave} disabled={saving}>
            {saving ? t('wizard.saqlanmoqda') : t('common.qayta_urinish')}
          </Button>
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex flex-col gap-3 pt-2">
        <Button
          size="lg"
          className="w-full"
          onClick={() => roomId && navigate(`/studio/${roomId}/ichkarida?phase=suvoq`)}
          disabled={!roomId}
        >
          {t('wizard.bezashni_boshlash')}
        </Button>
        <Button
          size="lg"
          variant="soft"
          className="w-full"
          onClick={() => roomId && navigate(`/smeta/${roomId}`)}
          disabled={!roomId}
        >
          {t('wizard.smeta_korish')}
        </Button>
        <button
          onClick={onNewRoom}
          className="w-full py-2 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          {t('wizard.yangi_xona')}
        </button>
      </div>
    </div>
  )
}

// ─── WizardPage ───────────────────────────────────────────────────────────────

export default function WizardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    draftId,
    ceilingHeight,
    geometry,
    roomId,
    wizardStep,
    designState,
    setDraftId,
    setCeilingHeight,
    setWallLength,
    addElement,
    removeElement,
    updateElement,
    swapElements,
    setRoomId,
    setWizardStep,
    loadDraftState,
    resetRoom,
    resetDesignState,
  } = useRoomStore()

  // The wizard sits outside AppShell, which is what normally applies the theme;
  // without this a fresh load of /wizard ignores a night choice.
  useAppThemeAttribute()

  const [searchParams] = useSearchParams()
  const existingApartmentId = searchParams.get('apartmentId') ?? null
  // Hand-drawn rooms (DrawRoomPage) already have exact wall lengths from the
  // drawing — asking the user to re-confirm each one is redundant. For this
  // entry path only, ceiling height is the one remaining real question;
  // confirming it saves the room and goes straight into its 3D view instead
  // of stepping through geometry.walls.length wall-review screens + results.
  const isFromDraw = searchParams.get('from') === 'draw'

  const [step, setStep] = React.useState(0)
  const [dir, setDir] = React.useState(1)
  const [saving, setSaving] = React.useState(false)
  const [saveFailed, setSaveFailed] = React.useState(false)
  const [ceilingValid, setCeilingValid] = React.useState(true)
  // The save in flight; the next save queues behind it (see handleSave).
  const savePromiseRef = React.useRef<Promise<string | null> | null>(null)
  // A project made by a failed attempt is reused on retry, not made twice.
  const createdApartmentIdRef = React.useRef<string | null>(null)
  const [resumePrompt, setResumePrompt] = React.useState(false)
  const [draftLoaded, setDraftLoaded] = React.useState(false)

  // ── On mount: fetch existing draft or create a new one ──────────────────
  // Once per page: StrictMode runs mount effects twice, and each run used to
  // create a draft, leaving an orphan row behind.
  const draftInitStarted = React.useRef(false)
  React.useEffect(() => {
    if (draftInitStarted.current) return
    draftInitStarted.current = true
    async function initDraft() {
      // The wizard only creates NEW rooms. A roomId left in the store (e.g.
      // arriving via "+ add room" from the studio) would make handleSave()
      // overwrite that room instead of creating the new one.
      if (roomId) {
        resetRoom()
        const draft = await createDraftRoom({})
        setDraftId(draft.id)
        setDraftLoaded(true)
        return
      }
      // roomId is NOT persisted, so after a page reload it is null here even
      // though the store rehydrated the PREVIOUS room's designState (the paint
      // or oboi picked in the studio) from localStorage — which then silently
      // became the "new" room's design, instead of DEFAULT_DESIGN_STATE's bare
      // plaster. A wizard draft's designState is never user-chosen either (the
      // wizard has no design controls; autosave just snapshots whatever the
      // store held), so resetting it on every new-room entry loses nothing.
      resetDesignState()
      if (draftId) {
        try {
          const draft = await getDraftRoom(draftId)
          const s = draft.state as { wizardStep?: number }
          if ((s.wizardStep ?? 0) > 0) {
            loadDraftState(draft.state)
            // Resume keeps the draft's DIMENSIONS; its designState snapshot is
            // stale store spillover (see above), so it still starts bare.
            resetDesignState()
            setResumePrompt(true)
          } else {
            setStep(0)
          }
        } catch {
          // Draft deleted or not found — create fresh
          const draft = await createDraftRoom({})
          setDraftId(draft.id)
        }
      } else {
        const draft = await createDraftRoom({})
        setDraftId(draft.id)
      }
      setDraftLoaded(true)
    }
    void initDraft()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-save to DB on every wizard state change (debounced 800ms) ──────
  React.useEffect(() => {
    if (!draftLoaded || !draftId || step >= geometry.walls.length + 1) return
    const timer = setTimeout(() => {
      void updateDraftRoom(draftId, {
        ceilingHeight,
        geometry,
        wizardStep: step,
        designState,
        roomId,
      })
    }, 800)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceilingHeight, geometry, step, designState, draftId, draftLoaded])

  // Keep first-wall lookup for the "link to A" feature in WallStep
  const wallA = geometry.walls.find((w) => w.id === 'A') ?? geometry.walls[0]!
  const walls = geometry.walls

  // Step 0 = ceiling, Steps 1–N = walls, Step N+1 = results
  const totalSteps = geometry.walls.length + 2
  const activeWall: string | null =
    step >= 1 && step <= geometry.walls.length ? geometry.walls[step - 1].id : null

  // Auto-save to DB when geometry changes (debounced 1.5s)
  React.useEffect(() => {
    if (step === 0 || step >= totalSteps - 1) return  // only during wall steps
    const timer = setTimeout(() => {
      void handleSave()
    }, 1500)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, ceilingHeight, step])

  /** Saves the room on the server and returns its id, or null when the save
   *  failed — the results step then says so and offers a retry, instead of
   *  carrying on with a room the server never got.
   *
   *  The first save creates the room (autosave usually does that while the
   *  user is still on wall A); every later one PATCHes its dimensions, so
   *  walls and openings entered after that point are not lost. Saves run one
   *  after another and each reads the store when it starts, so the last call
   *  always sends the latest dimensions and the room is never created twice. */
  function handleSave(): Promise<string | null> {
    const run = () => {
      const existing = useRoomStore.getState().roomId
      return existing ? updateRoomOnServer(existing) : saveRoomOnServer()
    }
    const previous = savePromiseRef.current
    const next: Promise<string | null> = (previous ? previous.then(run, run) : run()).finally(() => {
      if (savePromiseRef.current === next) savePromiseRef.current = null
    })
    savePromiseRef.current = next
    return next
  }

  /** The room's dimensions as the API takes them, from the store as it is now. */
  function roomDimensions() {
    const { ceilingHeight, geometry } = useRoomStore.getState()
    return {
      ceiling_h: ceilingHeight / 1000,
      geometry: {
        walls: geometry.walls.map((w) => {
          // Store mm (left edge, possibly an unresolved auto placeholder) →
          // API centre fractions. See lib/wallPositions.ts.
          const positions = wallElementsToApiPositions(w.elements, w.length)
          return {
            id: w.id,
            length: w.length / 1000,
            elements: w.elements.map((e, i) => ({
              type: e.type,
              width: e.width / 1000,
              height: e.height / 1000,
              sill_height: (e.sill_height ?? 0) / 1000,
              position: positions[i],
            })),
          }
        }),
        // Non-rectangular (hand-drawn / N-wall) rooms carry their real
        // outline here — omitted for the legacy 4-wall case, where it's
        // unset on the store's own geometry.
        vertices: geometry.vertices?.length
          ? geometry.vertices.map(([x, z]) => [x / 1000, z / 1000] as [number, number])
          : undefined,
      },
    }
  }

  async function saveRoomOnServer(): Promise<string | null> {
    setSaving(true)
    setSaveFailed(false)
    try {
      const aptId =
        existingApartmentId ??
        createdApartmentIdRef.current ??
        (createdApartmentIdRef.current = (await createApartment({ name: t('wizard.mening_xonadonim') })).id)
      const roomName = t('wizard.xona')
      const room_type = useRoomStore.getState().roomType ?? guessRoomType(roomName) ?? undefined
      const room = await createRoom(aptId, { name: roomName, room_type, ...roomDimensions() })
      setRoomId(room.id)
      // Draft fulfilled — clean up
      if (draftId) {
        try { await deleteDraftRoom(draftId) } catch { /* ignore */ }
        setDraftId(null)
      }
      return room.id
    } catch {
      setSaveFailed(true)
      return null
    } finally {
      setSaving(false)
    }
  }

  async function updateRoomOnServer(id: string): Promise<string | null> {
    setSaving(true)
    setSaveFailed(false)
    try {
      await updateRoom(id, roomDimensions())
      return id
    } catch {
      setSaveFailed(true)
      return null
    } finally {
      setSaving(false)
    }
  }

  // Directional "+ add room": place the new room on the side of the anchor
  // room that the user pressed. Runs at the results step, when the entered
  // dimensions are final (the room row itself may be created earlier by
  // autosave, before the user finishes editing wall lengths).
  async function persistLayoutPos() {
    const side = searchParams.get('side')
    if (!side) return
    const s = useRoomStore.getState()
    if (!s.roomId) return
    const ax = parseFloat(searchParams.get('ax') ?? '0')
    const az = parseFloat(searchParams.get('az') ?? '0')
    const aw = parseFloat(searchParams.get('aw') ?? '0')
    const ad = parseFloat(searchParams.get('ad') ?? '0')
    // Must match roomExtents()'s convention (lib/roomDims.ts) — same as
    // aw/ad above, which ThreeDPage's handleAddRoom computed via that exact
    // function. This used to be swapped (wall B → newW, wall A → newD),
    // desyncing from aw/ad and shrinking the gap into an outright overlap
    // between adjacent rooms in the same apartment.
    const newW = (s.geometry.walls.find((w) => w.id === 'A')?.length ?? 4000) / 1000
    const newD = (s.geometry.walls.find((w) => w.id === 'B')?.length ?? 3000) / 1000
    // Rooms are adjacent, not detached — each has its own real wall thickness,
    // so a near-zero gap still reads as two touching walls, not interpenetrating
    // geometry. A visible dead strip of empty floor between rooms (the old
    // 0.15m) read as a rendering bug, not a real architectural boundary.
    const GAP = 0.02
    const pos =
      side === 'east'  ? { x: ax + aw / 2 + GAP + newW / 2, z: az } :
      side === 'west'  ? { x: ax - aw / 2 - GAP - newW / 2, z: az } :
      side === 'north' ? { x: ax, z: az - ad / 2 - GAP - newD / 2 } :
                         { x: ax, z: az + ad / 2 + GAP + newD / 2 }
    s.setLayoutPos(pos)
    try {
      await updateRoom(s.roomId, { state: { layoutPos: pos } })
    } catch { /* offline / local-only room — position still kept in the store */ }
  }

  function goNext() {
    if (step === 0 && isFromDraw) {
      void handleSave().then((id) => {
        void persistLayoutPos()
        if (id) navigate(`/studio/${id}/ichkarida?phase=suvoq`)
      })
      return
    }
    const nextStep = step + 1
    setDir(1)
    setStep(nextStep)
    setWizardStep(nextStep)
    if (nextStep === totalSteps - 1) {
      void handleSave().then(() => void persistLayoutPos())
    }
  }

  function goBack() {
    setDir(-1)
    const prevStep = Math.max(step - 1, 0)
    setStep(prevStep)
    setWizardStep(prevStep)
  }

  function handleResume() {
    setStep(wizardStep)
    setResumePrompt(false)
  }

  async function handleRestart() {
    // Delete old draft and create a fresh one
    if (draftId) {
      try { await deleteDraftRoom(draftId) } catch { /* ignore */ }
    }
    resetRoom()
    const draft = await createDraftRoom({})
    setDraftId(draft.id)
    setStep(0)
    setResumePrompt(false)
  }

  const progressPct = totalSteps > 1 ? (step / (totalSteps - 1)) * 100 : 0

  return (
    <div className="min-h-screen bg-paper pb-4 lg:pb-8">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-3 px-3 pt-3 lg:min-h-0 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:px-6 lg:pt-6">

      {/* Draft resume banner */}
      {resumePrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-card shadow-panel p-5 animate-fade-slide">
            <h2 className="text-base font-extrabold text-ink mb-1">
              {t('wizard.saqlangan_loyiha')}
            </h2>
            <p className="text-sm text-ink-muted mb-5">
              {t('wizard.davom_etasizmi')}
            </p>
            <div className="flex gap-3">
              <Button variant="soft" className="flex-1" onClick={handleRestart}>
                {t('wizard.yangi_boshlash')}
              </Button>
              <Button className="flex-1" onClick={handleResume}>
                {t('wizard.davom_etish')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Isometric preview — the drawing is light, so it sits on its own pale board */}
      <Panel className="flex items-center justify-center p-3 lg:sticky lg:top-6">
        <div
          className="flex h-[22vh] min-h-[150px] w-full items-center justify-center overflow-hidden rounded-2xl bg-[#F4F6FB] px-3 py-2 [&>svg]:!max-h-full [&>svg]:h-full lg:h-[34vh] lg:max-h-[460px] lg:min-h-[200px] lg:py-3"
        >
          <IsometricRoomPreview
            geometry={geometry}
            ceilingHeight={ceilingHeight}
            activeWall={activeWall as 'A' | 'B' | 'C' | 'D' | null}
          />
        </div>
      </Panel>

      {/* Steps */}
      <Panel className="flex flex-col overflow-hidden">
        {/* Progress */}
        <div className="flex items-center gap-3 px-5 pt-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-card-soft">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#5B84F5] to-[#F59E4B]"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs font-semibold text-ink-muted">
            {Math.min(step + 1, totalSteps)}/{totalSteps}
          </span>
        </div>

        <div className="flex-1 px-5 py-5">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={stepTransition}
            >
              {step === 0 && (
                <Step0
                  ceilingHeight={ceilingHeight}
                  onChange={setCeilingHeight}
                  onNext={goNext}
                  onValidChange={setCeilingValid}
                />
              )}

              {step >= 1 && step <= geometry.walls.length && (
                <WallStep
                  wallIndex={step - 1}
                  wall={walls[step - 1] ?? walls[0]}
                  wallA={wallA}
                  ceilingHeight={ceilingHeight}
                  onLengthChange={setWallLength}
                  onAddElement={addElement}
                  onRemoveElement={removeElement}
                  onMoveElement={(wallId, elId, mm) => updateElement(wallId, elId, { position: mm })}
                  onSwapElements={swapElements}
                />
              )}

              {step === totalSteps - 1 && (
                <Step5
                  roomId={roomId}
                  geometry={geometry}
                  ceilingHeight={ceilingHeight}
                  saving={saving}
                  saveFailed={saveFailed}
                  onRetrySave={() => void handleSave().then((id) => { if (id) void persistLayoutPos() })}
                  onNewRoom={handleRestart}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {step < totalSteps - 1 && (
          <div className="flex items-center gap-3 border-t border-line px-5 pb-5 pt-4">
            {step > 0 && (
              <Button variant="soft" size="lg" onClick={goBack}>
                {t('wizard.ortga')}
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={goNext} disabled={saving || (step === 0 && !ceilingValid)}>
              {saving ? t('wizard.saqlanmoqda_nuqta') : t('wizard.keyingi')}
            </Button>
          </div>
        )}
      </Panel>
      </div>
    </div>
  )
}
