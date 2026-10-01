import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PanoramaViewer } from './PanoramaViewer'

// jsdom has no WebGL, which is exactly the situation the fallback is for: a device
// that cannot draw the sphere must still be shown the picture.
describe('PanoramaViewer without WebGL', () => {
  it('shows the plain image and says why, instead of an empty box', async () => {
    render(<PanoramaViewer src="https://x/pano.jpg" alt="360° panorama" className="h-40" />)
    const img = await screen.findByRole('img', { name: '360° panorama' })
    expect(img).toHaveAttribute('src', 'https://x/pano.jpg')
    await waitFor(() => expect(screen.getByText(/oddiy rasm ko'rsatilmoqda/)).toBeInTheDocument())
  })
})
