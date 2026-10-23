import type uz from "./locales/uz.json";

// Keys are typed from the Uzbek source file: a wrong key is a `tsc` error.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof uz };
  }
}
