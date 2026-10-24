import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { applyLanguage } from '@/i18n'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'
import ReferenceStory from './ReferenceStory'

const init = vi.fn(() => () => {})
vi.mock('./story/referenceStoryEngine', () => ({ initScrollStory: (labels: unknown) => init(labels) }))

afterEach(() => {
  applyLanguage('uz')
  init.mockClear()
})

describe('landing scroll story', () => {
  it.each(['uz', 'ru', 'en'] as const)('fills every text from the locale files in %s', (language) => {
    applyLanguage(language)
    const { container } = render(<ReferenceStory />)
    const text = container.innerHTML
    expect(text).not.toMatch(/\[\[|landing\.story\./)
  })

  it('writes the story in the chosen language and gives the engine its labels', async () => {
    applyLanguage('ru')
    const { container } = render(<ReferenceStory />)
    expect(container.querySelector('.cap h2')).toHaveTextContent(ru.landing.story.s1.title)
    expect(container.querySelector('.wl li')).toHaveTextContent('189 000 сум / рулон')
    await vi.waitFor(() => expect(init).toHaveBeenCalled())
    const labels = init.mock.calls[0][0] as { m2: string; rolls(n: number): string; wallpapers: string[] }
    expect(labels.m2).toBe('м²')
    expect([1, 3, 5].map((n) => labels.rolls(n))).toEqual(['1 рулон', '3 рулона', '5 рулонов'])
    expect(labels.wallpapers[1]).toBe(ru.landing.story.wallpapers.w1)
  })

  it('starts over in the new language when it changes', async () => {
    const { container, rerender } = render(<ReferenceStory />)
    expect(container.querySelector('.cap h2')).toHaveTextContent('Telefonni aylantiring')
    applyLanguage('en')
    rerender(<ReferenceStory />)
    expect(container.querySelector('.cap h2')).toHaveTextContent(en.landing.story.s1.title)
    await vi.waitFor(() => expect(init).toHaveBeenCalled())
    // The engine that runs is the one started for the new language.
    expect((init.mock.calls.at(-1)![0] as { wallpapers: string[] }).wallpapers[0]).toBe(en.landing.story.wallpapers.w0)
  })
})
