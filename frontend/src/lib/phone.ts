/** The rule the API applies to every phone it stores (app/schemas/auth.py):
 *  an Uzbek number, +998 and nine digits, spaces, dashes and brackets aside.
 *  Checked before sending so the form can say what is wrong instead of a
 *  generic error, and so a shop is never handed a number it cannot call. */
export function isUzPhone(value: string): boolean {
  return /^\+?998\d{9}$/.test(value.replace(/[\s\-()]/g, ""));
}

export const PHONE_ERROR = "Telefon raqami noto'g'ri. Masalan: +998 90 123 45 67";
