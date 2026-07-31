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

export const RENO_STAGES: Array<{ key: PhaseKey; label: string }> = [
  { key: 'suvoq',      label: "Suvoq"       },
  { key: 'shpaklovka', label: "Shpaklovka"  },
  { key: 'boyoq',      label: "Bo'yoq/Oboi" },
  { key: 'pol',        label: "Pol"         },
  { key: 'montaj',     label: "Montaj"      },
  { key: 'chiroq',     label: "Chiroq"      },
  { key: 'mebel',      label: "Mebel"       },
]
