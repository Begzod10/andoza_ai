import { Component, Suspense, type ReactNode } from 'react'
import { Environment } from '@react-three/drei'

/**
 * Locally-hosted equivalent of drei's `preset="apartment"` (lebombo_1k.hdr),
 * so the studio works offline / without the drei asset CDN.
 */
const LOCAL_HDR = '/hdr/lebombo_1k.hdr'

interface BoundaryState {
  failed: boolean
}

class EnvironmentErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[SafeEnvironment] environment map failed to load, falling back to plain lighting:', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface SafeEnvironmentProps {
  /** Forwarded to drei's `environmentIntensity` */
  intensity?: number
  /** HDR to load; defaults to the bundled offline-safe lebombo preset */
  files?: string
  /** Forwarded to drei's `background` — paints the HDRI as the visible sky */
  background?: boolean
}

/**
 * Image-based lighting that can never take the scene down: the HDR is served
 * from our own public/ folder, and if it still fails to load (or decode) the
 * error boundary swallows the crash so the scene keeps its analytic lights.
 */
export function SafeEnvironment({ intensity = 0.35, files = LOCAL_HDR, background = false }: SafeEnvironmentProps) {
  return (
    <EnvironmentErrorBoundary>
      <Suspense fallback={null}>
        <Environment files={files} environmentIntensity={intensity} background={background} />
      </Suspense>
    </EnvironmentErrorBoundary>
  )
}
