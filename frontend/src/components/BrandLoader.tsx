import { BRAND_LOADER_CSS, BRAND_LOADER_HTML } from "@/lib/brandLoader";

/**
 * Full-screen brand loader (the logo assembling itself) — what a lazy route
 * shows while its chunk downloads. Its first 0.2 s are invisible (see `.bl` in
 * lib/brandLoader), so a chunk that is already cached flashes nothing.
 * The markup is a static, in-repo constant; nothing user-supplied goes in.
 */
export function BrandLoader() {
  return (
    <>
      <style>{BRAND_LOADER_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: BRAND_LOADER_HTML }} />
    </>
  );
}
