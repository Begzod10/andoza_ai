import { useEffect, useRef, useState, type RefObject } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { uz } from "@/locale/uz"
import { createRender, waitForRender, errorMessage } from "@/lib/api"

type Phase = "idle" | "capturing" | "rendering" | "done" | "error"

/** Same origin the API lives on — a stored render comes back relative to it in local dev. */
function absolute(url: string): string {
  if (/^https?:\/\//.test(url)) return url
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000/api/v1"
  return new URL(url, new URL(base, window.location.href).origin).toString()
}

function captureJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
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
 * "Render": turns what the studio is showing into a photorealistic image.
 * Captures the live canvas, queues it (POST /render) and polls the job. The
 * card keeps the last result until the user renders again.
 *
 * A centred card on a wide screen, a bottom sheet on a phone. It is not the
 * shared BottomSheet: that one is a full-width, 90vh slab, which for a prompt
 * box and one picture was mostly empty white. Its z-index (80/70) sits above
 * the studio's own overlays, including the ⋮ menu and the edge arrows.
 */
export function RenderSheet({
  open, onOpenChange, glCanvasRef,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  glCanvasRef: RefObject<HTMLCanvasElement | null>
}) {
  const [prompt, setPrompt] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [imageUrl, setImageUrl] = useState("")
  const [error, setError] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  // Stop polling if the page goes away mid-render.
  useEffect(() => () => abortRef.current?.abort(), [])

  async function start() {
    if (phase === "capturing" || phase === "rendering") return
    setError("")
    setImageUrl("")
    const canvas = glCanvasRef.current
    setPhase("capturing")
    const blob = canvas ? await captureJpeg(canvas) : null
    if (!blob) {
      setError(uz.render.rasm_yoq)
      setPhase("error")
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setPhase("rendering")
      const { job_id } = await createRender(blob, prompt)
      const url = await waitForRender(job_id, controller.signal)
      setImageUrl(absolute(url))
      setPhase("done")
    } catch (err) {
      if (controller.signal.aborted) return
      setError(errorMessage(err))
      setPhase("error")
    }
  }

  const busy = phase === "capturing" || phase === "rendering"
  const done = phase === "done" && !!imageUrl

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
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={uz.render.placeholder}
              aria-label={uz.render.placeholder}
              maxLength={500}
              rows={2}
              disabled={busy}
              className="w-full resize-none rounded-2xl border border-transparent bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-brand/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10 disabled:opacity-60"
            />

            {/* Where the picture goes — present from the start so the card does not jump. */}
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-gray-50 ring-1 ring-inset ring-gray-200">
              {done ? (
                <img src={imageUrl} alt={uz.render.sarlavha} className="h-full w-full object-cover" />
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

            <div className="flex gap-3">
              {done && (
                <a
                  href={imageUrl}
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
                {busy ? uz.render.jarayonda : done ? uz.render.qayta : uz.render.boshlash}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
