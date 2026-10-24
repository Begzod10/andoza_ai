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
import { useTranslation } from 'react-i18next'

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

/** The fallback is a component of its own so it follows a language change. */
function CanvasFailed() {
  const { t } = useTranslation()
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#EEF1F7] text-center p-6">
      <p className="text-sm font-semibold text-gray-800">
        {t('studio.gl.title')}
      </p>
      <p className="text-xs text-gray-500 max-w-xs leading-5">
        {t('studio.gl.text')}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-1 px-5 py-2 rounded-full text-sm font-semibold transition-transform bg-gradient-to-br from-[#6C87F2] to-[#3B63DE] text-white shadow-soft-accent active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100"
      >
        {t('studio.gl.reload')}
      </button>
    </div>
  )
}

interface BoundaryState {
  failed: boolean
}

export class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (err: Error) => void },
  BoundaryState
> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(err: Error) {
    console.error('[studio] Canvas failed:', err)
    this.props.onError?.(err)
  }

  render() {
    if (this.state.failed) {
      return <CanvasFailed />
    }
    return this.props.children
  }
}
