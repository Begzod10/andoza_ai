import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { LightFixture } from '../LightFixtures'

type Props = { position?: [number, number, number]; args?: number[]; children?: ReactNode }

/** The flat top and bottom faces (y, radius) of every cylinder mesh a fixture draws, in its own frame. */
function cylinderFaces(node: ReactNode): Array<{ mesh: number; y: number; r: number }> {
  const faces: Array<{ mesh: number; y: number; r: number }> = []
  let mesh = 0
  const walk = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!isValidElement(n)) return
    const el = n as ReactElement<Props>
    if (el.type === 'mesh') {
      const kids = ([] as ReactNode[]).concat(el.props.children)
      const cyl = kids.find((k) => isValidElement(k) && (k as ReactElement).type === 'cylinderGeometry') as ReactElement<Props> | undefined
      if (cyl) {
        const [rTop, rBottom, height] = cyl.props.args ?? []
        const y = el.props.position?.[1] ?? 0
        faces.push({ mesh, y: y + height / 2, r: rTop }, { mesh, y: y - height / 2, r: rBottom })
        mesh++
      }
      return
    }
    walk(el.props.children)
  }
  walk(node)
  return faces
}

describe('light fixtures', () => {
  it('a ceiling light has no two flat faces in one plane (they flicker seen from above)', () => {
    const tree = LightFixture({ light: { id: 'l', type: 'ceiling', x: 0, y: 0 } as never, on: false })
    const faces = cylinderFaces(tree)
    const clashes = faces.filter((a, i) =>
      faces.some((b, j) => j > i && b.mesh !== a.mesh && Math.abs(a.y - b.y) < 0.0005),
    )
    expect(clashes).toEqual([])
  })
})
