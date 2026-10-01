import { useEffect, useRef, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { uz } from "@/locale/uz"
import { createRender, createRelight, createUpscale, listRenders, waitForRender, errorMessage, LIGHTING_MOODS } from "@/lib/api"
import type { SavedRender } from "@/lib/api"
import { panoramaJpeg } from "@/lib/panoramaSnap"
import { PanoramaViewer } from "./PanoramaViewer"
import type { LightingMood } from "@/lib/api"

type Phase = "idle" | "capturing" | "rendering" | "relighting" | "upscaling" | "done" | "error"

/** One picture the sheet can show: the render itself, or a relit copy of it. */
interface Version { url: string; key: string; label: string; lighting?: LightingMood; /** A 2:1 panorama, to be looked around in rather than looked at. */ panorama?: boolean; /** The 4K copy (3840 px), not the first render. */ upscaled?: boolean }

/** Same origin the API lives on — a stored render comes back relative to it in local dev. */
function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api/v1"
  return new URL(url, new URL(base, window.location.href).origin).toString()
}

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}

/**
 * "Render": turns a 360° panorama of the room into a photorealistic one.
 * Opened from the 360 camera, it takes the panorama and queues it
 * (POST /render) at once, then polls the job. The
 * card keeps the last result until the user renders again.
 *
 * A centred card on a wide screen, a bottom sheet on a phone. It is not the
 * shared BottomSheet: that one is a full-width, 90vh slab, which for a prompt
 * box and one picture was mostly empty white. Its z-index (80/70) sits above
 * the studio's own overlays, including the ⋮ menu and the edge arrows.
 */
export function RenderSheet({
  open, onOpenChange, roomId,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  /** The room being rendered: its pictures are saved against it and listed back. */
  roomId?: string
}) {
  const [prompt, setPrompt] = useState("")
  // True while the box holds the description the API wrote, not the user's own words.
  const [generated, setGenerated] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [versions, setVersions] = useState<Version[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState("")
  // A relight that fails must not throw away the render underneath it.
  const [relightError, setRelightError] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  // Every picture saved for this room, newest first.
  const [saved, setSaved] = useState<SavedRender[]>([])

  // Stop polling if the page goes away mid-render.
  useEffect(() => () => abortRef.current?.abort(), [])

  // The saved pictures: loaded when the sheet opens and again after each new
  // one lands (the task records it just before the job reports done).
  useEffect(() => {
    if (!open || !roomId || phase === "capturing" || phase === "rendering" || phase === "relighting" || phase === "upscaling") return
    let stale = false
    listRenders(roomId).then((rows) => { if (!stale) setSaved(rows) }).catch(() => {})
    return () => { stale = true }
  }, [open, roomId, phase])

  /** Show a picture from the saved list; it can be relit or made 4K like a fresh one. */
  function showSaved(row: SavedRender) {
    if (phase === "capturing" || phase === "rendering" || phase === "relighting" || phase === "upscaling") return
    setError("")
    setRelightError("")
    setVersions([{
      url: absolute(row.url), key: row.key, panorama: row.panorama, upscaled: row.kind === "upscale",
      lighting: (row.lighting as LightingMood | null) ?? undefined,
      label: row.kind === "upscale" ? "4K" : row.lighting ? uz.render.yorugliq[row.lighting as LightingMood] ?? row.lighting : uz.render.asl,
    }])
    setActive(0)
    setPhase("done")
  }

  // Opened from the 360 camera: the panorama is taken and sent at once, with
  // no further button to press. Opening again renders again.
  useEffect(() => {
    if (open) void start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function start() {
    if (phase === "capturing" || phase === "rendering") return
    setError("")
    setRelightError("")
    setVersions([])
    setActive(0)
    setPhase("capturing")
    const panorama = true
    const blob = await panoramaJpeg()
    if (!blob) {
      setError(uz.render.panorama_olinmadi)
      setPhase("error")
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setPhase("rendering")
      const { job_id } = await createRender(blob, prompt, roomId)
      const outcome = await waitForRender(job_id, controller.signal)
      setVersions([{ url: absolute(outcome.url), key: outcome.key, label: uz.render.asl, panorama }])
      setActive(0)
      // The prompt the picture was actually made from: when the user wrote none
      // this is the generated one, ready to edit for the next go (and sent as
      // theirs, so the next render skips the description step).
      if (!prompt.trim() && outcome.prompt) {
        setPrompt(outcome.prompt)
        setGenerated(true)
      }
      setPhase("done")
    } catch (err) {
      if (controller.signal.aborted) return
      setError(errorMessage(err))
      setPhase("error")
    }
  }

  async function relight(mood: LightingMood) {
    const base = versions[active]
    if (!base || phase === "relighting" || phase === "upscaling") return
    setRelightError("")
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase("relighting")
    try {
      const { job_id } = await createRelight(base.key, mood)
      const outcome = await waitForRender(job_id, controller.signal)
      const next: Version = {
        url: absolute(outcome.url), key: outcome.key, label: uz.render.yorugliq[mood], lighting: mood,
        panorama: base.panorama, // a relit panorama is still a panorama
      }
      setVersions((v) => [...v, next])
      setActive(versions.length)
    } catch (err) {
      if (controller.signal.aborted) return
      setRelightError(errorMessage(err))
    } finally {
      if (!controller.signal.aborted) setPhase("done")
    }
  }

  /** A 4K copy of the picture being shown — sharper to zoom into, and what a
   *  panorama wants, since a 360° picture spreads its pixels over the whole room. */
  async function upscale() {
    const base = versions[active]
    if (!base || base.upscaled || phase === "relighting" || phase === "upscaling") return
    setRelightError("")
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhase("upscaling")
    try {
      const { job_id } = await createUpscale(base.key)
      const outcome = await waitForRender(job_id, controller.signal)
      const next: Version = {
        url: absolute(outcome.url), key: outcome.key, label: "4K", lighting: base.lighting,
        panorama: base.panorama, upscaled: true,
      }
      setVersions((v) => [...v, next])
      setActive(versions.length)
    } catch (err) {
      if (controller.signal.aborted) return
      setRelightError(errorMessage(err))
    } finally {
      if (!controller.signal.aborted) setPhase("done")
    }
  }

  const current = versions[active]
  const followingUp = phase === "relighting" || phase === "upscaling" // a change to a finished render
  const busy = phase === "capturing" || phase === "rendering" || followingUp
  const done = !!current && (phase === "done" || followingUp)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          className={[
            "fixed z-[80] bg-white shadow-2xl outline-none flex flex-col",
            // phone: bottom sheet
            "inset-x-0 bottom-0 max-h-[92vh] rounded-t-[28px]",
            // wide: centred card
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-[min(92vw,560px)] sm:rounded-[28px]",
          ].join(" ")}
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-start justify-between gap-3 px-6 pt-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Sparkle />
              </span>
              <div>
                <Dialog.Title className="text-base font-semibold text-gray-900">{uz.render.sarlavha}</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-sm leading-snug text-gray-500">
                  {uz.render.izoh}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              aria-label={uz.common.yopish}
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6 pt-5">
            <p className="text-xs text-gray-400">{uz.render.panorama_izoh}</p>

            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setGenerated(false) }}
              placeholder={uz.render.placeholder}
              aria-label={uz.render.placeholder}
              maxLength={2000}
              rows={prompt.length > 120 ? 4 : 2}
              disabled={busy}
              className="w-full resize-none rounded-2xl border border-transparent bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-brand/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10 disabled:opacity-60"
            />

            {done && generated && prompt && (
              <p className="-mt-2 text-xs text-gray-400">{uz.render.avtomatik_tavsif}</p>
            )}

            {/* Where the picture goes — present from the start so the card does not jump. */}
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-inset ring-gray-200">
              {done ? (
                <>
                  {current.panorama ? (
                    <PanoramaViewer key={current.url} src={current.url} alt={uz.render.viewer.nom} className="h-full w-full" />
                  ) : (
                    <img src={current.url} alt={uz.render.sarlavha} className="h-full w-full object-cover" />
                  )}
                  {followingUp && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-[2px]">
                      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" aria-hidden />
                      <p className="text-sm font-medium text-gray-700" role="status">
                        {phase === "upscaling" ? uz.render.oshirilmoqda : uz.render.yoritilmoqda}
                      </p>
                    </div>
                  )}
                </>
              ) : busy ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-gray-50 to-gray-100">
                  <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" aria-hidden />
                  <p className="text-sm font-medium text-gray-600" role="status">
                    {phase === "capturing" ? uz.render.tayyorlanmoqda : uz.render.jarayonda}
                  </p>
                  <p className="text-xs text-gray-400">{uz.render.vaqt}</p>
                </div>
              ) : phase === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-50 px-8 text-center">
                  <p role="alert" className="text-sm font-medium text-red-700">
                    {uz.render.xato}: {error}
                  </p>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <Sparkle className="h-7 w-7" />
                  <p className="text-sm">{uz.render.natija_joyi}</p>
                </div>
              )}
            </div>

            {done && versions.length > 1 && (
              <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={uz.render.sarlavha}>
                {versions.map((v, i) => (
                  <button
                    key={v.key}
                    role="tab"
                    aria-selected={i === active}
                    onClick={() => setActive(i)}
                    disabled={followingUp}
                    className={`shrink-0 overflow-hidden rounded-xl text-left ring-2 transition ${
                      i === active ? "ring-brand" : "ring-transparent opacity-80 hover:opacity-100"
                    }`}
                  >
                    <img src={v.url} alt="" className="h-14 w-20 object-cover" />
                    <span className="block bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">{v.label}</span>
                  </button>
                ))}
              </div>
            )}

            {done && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{uz.render.yoritish}</p>
                <div className="flex flex-wrap gap-2">
                  {LIGHTING_MOODS.map((mood) => (
                    <button
                      key={mood}
                      onClick={() => relight(mood)}
                      disabled={busy}
                      aria-pressed={current?.lighting === mood}
                      className={`min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition disabled:opacity-50 ${
                        current?.lighting === mood
                          ? "bg-brand text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {uz.render.yorugliq[mood]}
                    </button>
                  ))}
                </div>
                {relightError && <p role="alert" className="mt-2 text-xs text-red-600">{relightError}</p>}
              </div>
            )}

            {done && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{uz.render.sifat}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={upscale}
                    disabled={busy || !!current?.upscaled}
                    className="min-h-[36px] rounded-full bg-gray-100 px-3.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
                  >
                    {current?.upscaled ? "4K ✓" : uz.render.to4k}
                  </button>
                  {current?.panorama && !current.upscaled && (
                    <span className="text-xs text-gray-400">{uz.render.to4k_izoh}</span>
                  )}
                </div>
              </div>
            )}

            {saved.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{uz.render.saqlangan}</p>
                <div className="flex gap-2 overflow-x-auto" aria-label={uz.render.saqlangan}>
                  {saved.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => showSaved(row)}
                      disabled={busy}
                      aria-label={`${uz.render.saqlangan}: ${new Date(row.created_at).toLocaleString()}`}
                      className={`shrink-0 overflow-hidden rounded-xl ring-2 transition disabled:opacity-60 ${
                        current?.key === row.key ? "ring-brand" : "ring-transparent opacity-80 hover:opacity-100"
                      }`}
                    >
                      <img src={absolute(row.url)} alt="" loading="lazy" className="h-14 w-20 object-cover" />
                      <span className="block bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        {row.kind === "upscale" ? "4K" : row.kind === "relight" ? uz.render.yoritish : uz.render.asl}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {done && (
                <a
                  href={current.url}
                  download="render.jpg"
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[48px] flex-1 items-center justify-center rounded-full border border-gray-200 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {uz.render.yuklab_olish}
                </a>
              )}
              <button
                onClick={start}
                disabled={busy}
                className="min-h-[48px] flex-1 rounded-full bg-brand text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
              >
                {phase === "capturing" || phase === "rendering" ? uz.render.jarayonda : done ? uz.render.qayta : uz.render.boshlash}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
