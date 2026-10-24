/**
 * ReferenceStory — the owner's scroll-driven canvas story, ported from
 * reference/AndozaAI.html. The markup is injected with its texts filled in from
 * the locale files (`[[key]]` or `[[key|value]]` in the HTML); the canvas engine
 * runs in an effect after mount and is fully torn down (listeners + rAF) on
 * unmount. A language change remounts it, so the markup and the engine's own
 * canvas texts and readouts all switch together.
 */
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { initScrollStory, type StoryLabels } from "./story/referenceStoryEngine";
import storyHtml from "./story/referenceStory.html?raw";
import "./story/referenceStory.css";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** The engine's own texts (canvas labels, readouts, estimate rows). */
function storyLabels(t: Translate): StoryLabels {
  const s = (key: string, options?: Record<string, unknown>) => t(`landing.story.${key}`, options);
  return {
    m: s("m"),
    m2: s("m2"),
    wallpapers: [0, 1, 2, 3, 4, 5].map((i) => s(`wallpapers.w${i}`)),
    plan: s("plan"),
    view3d: s("rail.view3d"),
    lidar: s("rail.lidar"),
    gypsum: s("gypsum"),
    start: s("start"),
    center: s("center"),
    area: s("area").toUpperCase(),
    wallpaperCaps: s("rail.wallpaper").toUpperCase(),
    furnitureCaps: s("rail.furniture").toUpperCase(),
    addWindow: s("addWindow"),
    addDoor: s("addDoor"),
    wallpaper: s("rail.wallpaper"),
    laminate: s("laminate"),
    skirting: s("skirting"),
    rolls: (count) => s("rolls", { count }),
    rollsDiamond: (count) => s("rollsDiamond", { count }),
    rollsPrice: (count, price) => s("rollsPrice", { count, price }),
    pieces: (count) => s("pieces", { count }),
  };
}

/** Fills the `[[key]]` / `[[key|value]]` markers of the story markup. */
function fillStory(html: string, t: Translate): string {
  return html.replace(/\[\[([\w.]+)(?:\|([^\]]*))?\]\]/g, (_, key: string, n?: string) =>
    t(`landing.story.${key}`, n === undefined ? undefined : { n }),
  );
}

function Story() {
  const { t } = useTranslation();
  const translate = t as unknown as Translate;
  const html = useMemo(() => fillStory(storyHtml, translate), [translate]);

  useEffect(() => {
    let cleanup = () => {};
    // Run on the next frame so the injected markup is in the DOM before the
    // engine queries #story / #cv.
    const id = requestAnimationFrame(() => {
      cleanup = initScrollStory(storyLabels(translate));
    });
    return () => {
      cancelAnimationFrame(id);
      cleanup();
    };
  }, [translate]);

  return <div className="andoza-story-root" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ReferenceStory() {
  const { i18n } = useTranslation();
  return <Story key={i18n.resolvedLanguage} />;
}
