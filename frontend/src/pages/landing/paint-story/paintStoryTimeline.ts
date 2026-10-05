/**
 * paintStoryTimeline — wires geometry + DOM + GSAP ScrollTrigger together.
 *
 * Everything is driven by ONE timeline that ScrollTrigger scrubs
 * (`scrub: true`, `pin: true`). There is no autoplay and no React state in the
 * scroll loop: per frame we only write transforms and dash offsets.
 */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CARD_ENTER, ROLLER_MOTION, TIMING } from "./config";
import { buildRoute, nearestS, pointAt, sampleRoute, type PathPoint } from "./ScrollPath";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true }); // mobile URL-bar show/hide must not rebuild the scene

/** measure a CSS length variable (any unit: vh, svh, px…) in px */
function readPx(host: HTMLElement, prop: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;width:0;height:var(${prop},0px)`;
  host.appendChild(probe);
  const v = probe.getBoundingClientRect().height;
  probe.remove();
  return v;
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Build the scene once for the current size. Returns a teardown function. */
function build(section: HTMLElement): () => void {
  const W = section.clientWidth;
  const H = section.clientHeight;
  const T = readPx(section, "--roller-size") || H * 0.37; // roller length = band thickness
  const scrollPx = readPx(section, "--scroll-length") || H * 5;
  const rough = parseFloat(getComputedStyle(section).getPropertyValue("--edge-roughness")) || 0;

  const roller = section.querySelector<HTMLElement>("[data-roller]")!;
  const arm = section.querySelector<SVGGElement>("[data-roller-arm]")!;
  const paths = Array.from(section.querySelectorAll<SVGPathElement>("[data-paint-path]"));
  const cardEls = Array.from(section.querySelectorAll<HTMLElement>(".pcard"));
  const layer = section.querySelector<SVGSVGElement>("[data-paint-layer]")!;

  /* ── route + path attributes ─────────────────────────────────────────── */
  const route = buildRoute({ W, H, T });
  layer.setAttribute("viewBox", `0 0 ${W} ${H}`);
  paths.forEach((p) => {
    p.setAttribute("d", route.d);
    p.setAttribute("stroke-width", String(T));
  });

  // each card's film is a stage-sized SVG offset so the route lines up with the wall layer
  cardEls.forEach((el) => {
    const film = el.querySelector<SVGSVGElement>("[data-film]");
    if (!film) return;
    film.setAttribute("viewBox", `0 0 ${W} ${H}`);
    film.style.width = `${W}px`;
    film.style.height = `${H}px`;
    film.style.left = `${-el.offsetLeft}px`;
    film.style.top = `${-el.offsetTop}px`;
  });

  // rough (rolled) paint edge — region must cover the whole stage incl. the stroke overhang
  const filter = section.querySelector<SVGFilterElement>("[data-rough-filter]");
  const mapEl = section.querySelector<SVGFEDisplacementMapElement>("[data-rough-map]");
  const masked = section.querySelector<SVGPathElement>("[data-masked]");
  if (filter && mapEl && masked) {
    filter.setAttribute("x", "-200");
    filter.setAttribute("y", "-200");
    filter.setAttribute("width", String(W + 400));
    filter.setAttribute("height", String(H + 400));
    mapEl.setAttribute("scale", String(rough));
    if (rough <= 0) masked.removeAttribute("filter");
  }

  const L = paths[0].getTotalLength();
  const dash = L + 2;
  paths.forEach((p) => {
    p.style.strokeDasharray = `${dash} ${dash}`;
    p.style.strokeDashoffset = String(dash);
  });
  const lut = sampleRoute(paths[0], TIMING.sampleStepPx);

  /* ── per-frame renderer (no React, no layout reads) ──────────────────── */
  gsap.set(arm, { svgOrigin: "48 150" });
  const setX = gsap.quickSetter(roller, "x", "px");
  const setY = gsap.quickSetter(roller, "y", "px");
  const setRot = gsap.quickSetter(roller, "rotation", "deg");
  const setFlip = gsap.quickSetter(arm, "scaleX");
  const pt: PathPoint = { x: 0, y: 0, tx: 0, ty: 0 };

  const render = (p: number) => {
    const s = p * L;
    pointAt(lut, s, pt);
    setX(pt.x);
    setY(pt.y);
    // moving left = -tilt, moving right = +tilt, plus a faint hand-held wobble
    setRot(pt.tx * ROLLER_MOTION.tiltDeg + Math.sin(s * 0.011) * ROLLER_MOTION.wobbleDeg);
    // art is drawn for "moving left"; swing the arm over smoothly on direction change
    setFlip(s < route.firstRowS ? 1 : clamp(-pt.tx * ROLLER_MOTION.flipGain, -1, 1));
    const off = String(dash * (1 - p));
    for (let i = 0; i < paths.length; i++) paths[i].style.strokeDashoffset = off;
  };
  render(0);

  /* ── the single scrubbed timeline ────────────────────────────────────── */
  const span = TIMING.end - TIMING.start;
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: `+=${scrollPx}`,
      pin: true,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });

  const proxy = { p: 0 };
  tl.to(proxy, { p: 1, duration: span, onUpdate: () => render(proxy.p) }, TIMING.start);

  // card entrances: each starts when the roller is `leadPx` away along the route
  cardEls.forEach((el) => {
    const side = el.dataset.side === "left" ? -1 : 1;
    const cx = el.offsetLeft + el.offsetWidth / 2;
    const cy = el.offsetTop + el.offsetHeight / 2;
    const sCenter = nearestS(lut, cx, cy);
    // lead/duration are capped by screen width so cards never pop in a whole pass early on phones
    const lead = Math.min(CARD_ENTER.leadPx, W * 0.3);
    const enterPx = Math.min(CARD_ENTER.durationPx, W * 0.22);
    const s0 = Math.max(0, sCenter - (el.offsetWidth / 2 + lead));
    tl.fromTo(
      el,
      { ...CARD_ENTER.from, rotation: CARD_ENTER.from.rotation * side, transformOrigin: "50% 50%" },
      {
        opacity: 1,
        scale: 1,
        rotation: 0,
        y: 0,
        ease: CARD_ENTER.ease,
        duration: (enterPx / L) * span,
      },
      TIMING.start + (s0 / L) * span,
    );
  });

  tl.to({}, { duration: 0 }, 1); // make the timeline exactly 1 long

  return () => {
    tl.scrollTrigger?.kill(true);
    tl.kill();
    // clear ONLY what GSAP animated — never "all": the cards carry inline --cx/--cy position variables
    gsap.set([roller, arm], { clearProps: "transform" });
    gsap.set(cardEls, { clearProps: "opacity,transform,transformOrigin" });
  };
}

/** Initialise (and re-initialise on resize). Returns a cleanup function. */
export function initPaintStory(section: HTMLElement): () => void {
  let teardown = build(section);
  let lastW = section.clientWidth;
  let lastH = section.clientHeight;
  let timer = 0;

  const ro = new ResizeObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const w = section.clientWidth;
      const h = section.clientHeight;
      // ignore tiny height jitter (mobile browser chrome); rebuild on real size changes
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 120) return;
      lastW = w;
      lastH = h;
      teardown();
      teardown = build(section);
      ScrollTrigger.refresh();
    }, 180);
  });
  ro.observe(section);

  // Content above this section (images, web fonts, lazy parts) can change the page height
  // after we measured the pin start. Re-measure whenever the document height settles.
  let refreshTimer = 0;
  const scheduleRefresh = () => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 250);
  };
  const bodyRo = new ResizeObserver(scheduleRefresh);
  bodyRo.observe(document.body);
  window.addEventListener("load", scheduleRefresh);
  void document.fonts?.ready.then(scheduleRefresh);

  return () => {
    window.clearTimeout(timer);
    window.clearTimeout(refreshTimer);
    window.removeEventListener("load", scheduleRefresh);
    bodyRo.disconnect();
    ro.disconnect();
    teardown();
  };
}
