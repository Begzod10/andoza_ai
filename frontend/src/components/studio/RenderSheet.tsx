import { useEffect, useRef, useState, type RefObject } from "react"
import { BottomSheet } from "@/components/ui/BottomSheet"
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

/**
 * "Render": turns what the studio is showing into a photorealistic image.
 * Captures the live canvas, queues it (POST /render) and polls the job. The
 * sheet keeps the last result until the user renders again.
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

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={uz.render.sarlavha} defaultSnap="full">
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-gray-500">{uz.render.izoh}</p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={uz.render.placeholder}
          maxLength={500}
          rows={2}
          disabled={busy}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
        />

        <button
          onClick={start}
          disabled={busy}
          className="min-h-[44px] rounded-full bg-brand text-white text-sm font-semibold disabled:opacity-60"
        >
          {phase === "capturing" ? uz.render.tayyorlanmoqda
            : phase === "rendering" ? uz.render.jarayonda
            : phase === "done" ? uz.render.qayta
            : uz.render.boshlash}
        </button>

        {phase === "error" && (
          <p role="alert" className="text-sm text-red-600">{uz.render.xato}: {error}</p>
        )}

        {phase === "done" && imageUrl && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-emerald-700">{uz.render.tayyor}</p>
            <img src={imageUrl} alt={uz.render.sarlavha} className="w-full rounded-xl" />
            <a
              href={imageUrl}
              download="render.jpg"
              target="_blank"
              rel="noreferrer"
              className="min-h-[44px] flex items-center justify-center rounded-full border border-gray-200 text-sm font-medium"
            >
              {uz.render.yuklab_olish}
            </a>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
