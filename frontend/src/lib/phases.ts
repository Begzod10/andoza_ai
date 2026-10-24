import type { TKey } from '@/i18n'

/**
 * Renovation phases — the left-hand stepper in the studio, and the key the
 * design panel switches its sections on.
 *
 * Defined once here because the list previously existed twice (the page and
 * the panel each had their own copy) and they drifted: adding a phase to one
 * left the other rejecting it as an impossible value.
 */
export type PhaseKey =
  | 'suvoq'
  | 'shpaklovka'
  | 'boyoq'
  | 'pol'
  | 'montaj'
  | 'chiroq'
  | 'mebel'

export const RENO_STAGES: Array<{ key: PhaseKey; labelKey: TKey }> = [
  { key: 'suvoq', labelKey: 'studio.lib.stage.suvoq' },
  { key: 'shpaklovka', labelKey: 'studio.lib.stage.shpaklovka' },
  { key: 'boyoq', labelKey: 'studio.lib.stage.boyoq' },
  { key: 'pol', labelKey: 'studio.lib.stage.pol' },
  { key: 'montaj', labelKey: 'studio.lib.stage.montaj' },
  { key: 'chiroq', labelKey: 'studio.lib.stage.chiroq' },
  { key: 'mebel', labelKey: 'studio.lib.stage.mebel' },
]
