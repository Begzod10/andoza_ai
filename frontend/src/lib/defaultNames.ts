import i18n from '@/i18n'

/** Name given to a room created without one, in the interface language of the moment (never at import time). */
export function defaultRoomName(): string {
  return i18n.t('wizard.xona')
}

/** Name given to an apartment created without one. */
export function defaultApartmentName(): string {
  return i18n.t('studio.lib.default_apartment')
}
