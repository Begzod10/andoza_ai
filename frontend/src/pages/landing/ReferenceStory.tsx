/**
 * ReferenceStory — the owner's scroll-driven canvas story, ported verbatim from
 * reference/AndozaAI.html. The markup is injected as-is; the canvas engine runs
 * in an effect after mount and is fully torn down (listeners + rAF) on unmount.
 */
import { useEffect } from "react";
import { initScrollStory } from "./story/referenceStoryEngine";
import storyHtml from "./story/referenceStory.html?raw";
import "./story/referenceStory.css";

export default function ReferenceStory() {
  useEffect(() => {
    let cleanup = () => {};
    // Run on the next frame so the injected markup is in the DOM before the
    // engine queries #story / #cv.
    const id = requestAnimationFrame(() => {
      cleanup = initScrollStory();
    });
    return () => {
      cancelAnimationFrame(id);
      cleanup();
    };
  }, []);

  return <div className="andoza-story-root" dangerouslySetInnerHTML={{ __html: storyHtml }} />;
}
