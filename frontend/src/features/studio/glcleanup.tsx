/**
 * WebGL context hygiene for the studio's multiple canvases.
 *
 * Browsers cap WebGL contexts (~8–16 per tab). Each studio tab switch mounts
 * a new <Canvas>, and dead contexts only free on GC — bounce between tabs a
 * few times and `new WebGLRenderer` throws "Error creating WebGL context".
 * ReleaseGLOnUnmount forces the context loss immediately on unmount so the
 * slot is returned right away; CanvasErrorBoundary turns the remaining rare
 * failure into a friendly reload prompt instead of the router's crash page.
 */
import * as React from 'react'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

export function ReleaseGLOnUnmount() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    return () => {
      try {
        gl.forceContextLoss()
      } catch {
        /* context already gone */
      }
    }
  }, [gl])
  return null
}

interface BoundaryState {
  failed: boolean
}

export class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BoundaryState
> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#EEF1F7] text-center p-6">
          <p className="text-3xl">🎨</p>
          <p className="text-sm font-semibold text-gray-800">
            3D ko'rinishni ochib bo'lmadi
          </p>
          <p className="text-xs text-gray-500 max-w-xs leading-5">
            Brauzer grafik xotirasi band (WebGL). Sahifani yangilasangiz, hammasi joyiga tushadi.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-1 px-5 py-2 rounded-xl bg-brand text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            Sahifani yangilash
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
