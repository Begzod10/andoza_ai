/**
 * Illustrated renovation scene behind the auth card — a bright, airy light-blue
 * room rendered as three parallax depth layers (far / mid / near). Each layer
 * drifts a different amount with the pointer (smoothed by springs) to give the
 * scene real depth. Purely decorative; disabled for reduced-motion.
 */
import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

// ── FAR layer: room, light, window, painted wall ───────────────────────────
function FarLayer() {
  return (
    <svg className="h-full w-full" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rb-room" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#f4f9ff" />
          <stop offset="0.5" stopColor="#e3effc" />
          <stop offset="1" stopColor="#cbe0f7" />
        </linearGradient>
        <linearGradient id="rb-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9f1fc" />
          <stop offset="1" stopColor="#d2e3f6" />
        </linearGradient>
        <linearGradient id="rb-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#e6f1ff" />
          <stop offset="1" stopColor="#cfe4fb" />
        </linearGradient>
        <linearGradient id="rb-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9ec2ea" />
          <stop offset="1" stopColor="#5f97d6" />
        </linearGradient>
        <radialGradient id="rb-sun" cx="0.28" cy="0.2" r="0.6">
          <stop offset="0" stopColor="#fffdf6" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="1440" height="1000" fill="url(#rb-room)" />
      <rect y="690" width="1440" height="310" fill="url(#rb-floor)" />
      <ellipse cx="360" cy="150" rx="620" ry="440" fill="url(#rb-sun)" />

      {/* window */}
      <g>
        <rect x="60" y="52" width="340" height="410" rx="12" fill="#ffffff" />
        <rect x="60" y="52" width="340" height="410" rx="12" fill="none" stroke="#dbe7f5" strokeWidth="2" />
        <rect x="80" y="72" width="300" height="370" fill="url(#rb-glass)" />
        <rect x="224" y="72" width="12" height="370" fill="#ffffff" />
        <rect x="80" y="251" width="300" height="12" fill="#ffffff" />
        {/* light rays */}
        <g opacity="0.4" fill="#ffffff">
          <polygon points="110,84 372,84 320,470 190,470" />
          <polygon points="180,84 250,84 240,520 150,520" opacity="0.5" />
        </g>
      </g>

      {/* half-painted blue wall (right), roller strokes */}
      <g>
        <path
          d="M1052 200 q14 -10 30 0 q28 -8 46 4 q30 -10 54 2 q26 -4 40 8 l8 372 q-46 12 -78 2 q-34 12 -72 2 q-32 10 -62 -2 l-8 -382 q30 -12 42 -8 Z"
          fill="url(#rb-wall)"
        />
        <g opacity="0.16" stroke="#ffffff" strokeWidth="12" strokeLinecap="round">
          <line x1="1088" y1="224" x2="1094" y2="560" />
          <line x1="1150" y1="214" x2="1156" y2="566" />
          <line x1="1212" y1="220" x2="1216" y2="560" />
        </g>
        <g opacity="0.10" stroke="#0b3f77" strokeWidth="6" strokeLinecap="round">
          <line x1="1120" y1="230" x2="1124" y2="552" />
          <line x1="1182" y1="222" x2="1186" y2="556" />
        </g>
      </g>
    </svg>
  );
}

// ── MID layer: annotation, checklist, plants, mug, blueprint ───────────────
function MidLayer() {
  return (
    <svg className="h-full w-full" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rb-leaf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#57b981" />
          <stop offset="1" stopColor="#2f8f5b" />
        </linearGradient>
      </defs>

      {/* hand-drawn annotation */}
      <g fill="#2f74d6">
        <text x="360" y="326" fontFamily="'Segoe Script','Bradley Hand',cursive" fontStyle="italic" fontWeight="600" fontSize="36" transform="rotate(-8 360 326)">
          Ta'mir rejadan
        </text>
        <text x="396" y="370" fontFamily="'Segoe Script','Bradley Hand',cursive" fontStyle="italic" fontWeight="600" fontSize="36" transform="rotate(-8 396 370)">
          boshlanadi
        </text>
        <path d="M356 388 q64 18 156 6" fill="none" stroke="#2f74d6" strokeWidth="4" strokeLinecap="round" />
        <g fill="none" stroke="#2f74d6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M548 360 l26 -24 l26 24" />
          <rect x="556" y="360" width="36" height="30" />
        </g>
      </g>

      {/* checklist */}
      <g>
        {["Eng yaxshi uy", "Qulaylik", "Shinamlik"].map((label, i) => {
          const y = 250 + i * 56;
          return (
            <g key={label}>
              <rect x="1176" y={y - 24} width="32" height="32" rx="8" fill="#ffffff" stroke="#2f74d6" strokeWidth="3" />
              <path d={`M1183 ${y - 9} l7 8 l12 -15`} fill="none" stroke="#2f74d6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <text x="1222" y={y + 2} fontSize="30" fontWeight="700" fill="#2f5b93">{label}</text>
            </g>
          );
        })}
      </g>

      {/* blueprint on the desk */}
      <g transform="rotate(-6 1120 828)">
        <rect x="978" y="742" width="308" height="188" rx="8" fill="#eef4fc" stroke="#c3d4ea" strokeWidth="2" />
        <g stroke="#8fb3df" strokeWidth="2.5" fill="none">
          <rect x="1008" y="772" width="126" height="94" />
          <rect x="1152" y="772" width="96" height="62" />
          <line x1="1008" y1="804" x2="1134" y2="804" />
          <line x1="1071" y1="772" x2="1071" y2="866" />
        </g>
        <line x1="998" y1="905" x2="1122" y2="902" stroke="#f59e0b" strokeWidth="7" strokeLinecap="round" />
        <line x1="1040" y1="915" x2="1164" y2="910" stroke="#facc15" strokeWidth="7" strokeLinecap="round" />
      </g>

      {/* mug with house */}
      <g>
        <ellipse cx="1150" cy="726" rx="46" ry="8" fill="#8fb3e6" opacity="0.35" />
        <rect x="1108" y="640" width="88" height="82" rx="16" fill="#ffffff" stroke="#cdd9ea" strokeWidth="2" />
        <path d="M1196 656 q30 5 30 27 q0 22 -30 27" fill="none" stroke="#cdd9ea" strokeWidth="9" />
        <path d="M1138 702 l14 -17 l14 17 Z" fill="none" stroke="#2f74d6" strokeWidth="4" />
        <rect x="1145" y="695" width="14" height="13" fill="none" stroke="#2f74d6" strokeWidth="4" />
      </g>

      {/* right floor plant */}
      <g>
        <ellipse cx="1332" cy="770" rx="50" ry="8" fill="#8fb3e6" opacity="0.35" />
        <path d="M1300 700 h66 l-9 62 a6 6 0 0 1 -6 5 h-40 a6 6 0 0 1 -6 -5 Z" fill="#5a95d6" />
        <path d="M1333 700 C 1294 646 1298 608 1330 596 C 1326 648 1354 664 1333 700 Z" fill="url(#rb-leaf)" />
        <path d="M1333 700 C 1372 648 1376 610 1344 596 C 1348 648 1314 666 1333 700 Z" fill="#4bb377" />
        <path d="M1333 700 C 1333 654 1333 620 1333 600 C 1345 640 1321 670 1333 700 Z" fill="#3f9a63" />
      </g>

      {/* window-sill plant */}
      <g>
        <rect x="150" y="440" width="64" height="48" rx="7" fill="#5a95d6" />
        <path d="M182 440 C 150 396 152 366 178 356 C 176 398 200 410 182 440 Z" fill="url(#rb-leaf)" />
        <path d="M182 440 C 214 398 218 368 192 356 C 194 398 164 412 182 440 Z" fill="#4bb377" />
      </g>
    </svg>
  );
}

// ── NEAR layer: ladder + paint tools (closest to the camera) ───────────────
function NearLayer() {
  return (
    <svg className="h-full w-full" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rb-metal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#eef1f6" />
          <stop offset="0.5" stopColor="#cad2dd" />
          <stop offset="1" stopColor="#aab4c1" />
        </linearGradient>
        <linearGradient id="rb-paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b7fff" />
          <stop offset="1" stopColor="#1e5fd6" />
        </linearGradient>
        <radialGradient id="rb-roller-pole" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#dfe5ee" />
          <stop offset="1" stopColor="#aab4c1" />
        </radialGradient>
      </defs>

      {/* step-ladder */}
      <g>
        <ellipse cx="240" cy="726" rx="120" ry="12" fill="#8fb3e6" opacity="0.3" />
        <g stroke="url(#rb-metal)" strokeWidth="13" strokeLinecap="round" fill="none">
          <line x1="206" y1="428" x2="146" y2="720" />
          <line x1="274" y1="428" x2="334" y2="720" />
          <line x1="240" y1="430" x2="240" y2="700" />
          <line x1="192" y1="500" x2="288" y2="500" />
          <line x1="180" y1="562" x2="300" y2="562" />
          <line x1="168" y1="624" x2="312" y2="624" />
          <line x1="156" y1="686" x2="324" y2="686" />
        </g>
        <rect x="192" y="414" width="96" height="22" rx="7" fill="#cdd6e2" stroke="#aab4c1" strokeWidth="1" />
      </g>

      {/* paint bucket */}
      <g>
        <ellipse cx="404" cy="690" rx="56" ry="10" fill="#8fb3e6" opacity="0.35" />
        <path d="M354 556 h100 l-11 122 a11 11 0 0 1 -11 10 h-56 a11 11 0 0 1 -11 -10 Z" fill="#f6f9fd" stroke="#c2d0e2" strokeWidth="2" />
        <path d="M354 556 h100 l-4 48 h-92 Z" fill="url(#rb-paint)" />
        <ellipse cx="404" cy="556" rx="50" ry="13" fill="#dbe7f6" stroke="#c2d0e2" strokeWidth="2" />
        <ellipse cx="404" cy="556" rx="38" ry="8" fill="#2f6bff" />
        <path d="M357 555 c8 -24 86 -24 94 0" fill="none" stroke="#95a3b5" strokeWidth="6" />
        <path d="M372 604 q-4 22 6 40" fill="none" stroke="#2f6bff" strokeWidth="5" strokeLinecap="round" />
      </g>

      {/* roller tray + roller + brush + tape */}
      <g>
        <path d="M116 692 h190 l-19 58 a11 11 0 0 1 -10 6 h-122 a11 11 0 0 1 -10 -6 Z" fill="#e8eef6" stroke="#c2d0e2" strokeWidth="2" />
        <path d="M174 726 h124 l-12 30 a8 8 0 0 1 -7 5 h-90 Z" fill="url(#rb-paint)" />
        <rect x="150" y="668" width="104" height="32" rx="16" fill="#f1f6ff" stroke="#9db6de" strokeWidth="2" />
        <rect x="150" y="688" width="104" height="12" rx="6" fill="#2f6bff" />
        <rect x="150" y="668" width="14" height="32" rx="7" fill="#d3e0f4" />
        <path d="M254 683 h28 v12 h-22" fill="none" stroke="#64748b" strokeWidth="7" strokeLinecap="round" />

        <g transform="rotate(22 486 700)">
          <rect x="452" y="700" width="76" height="20" rx="6" fill="#2f6bff" />
          <rect x="526" y="698" width="22" height="24" rx="4" fill="#c7ccd3" />
          <rect x="546" y="695" width="34" height="30" rx="5" fill="#e7d6a8" />
        </g>

        <g>
          <circle cx="588" cy="742" r="28" fill="#f1e7c7" stroke="#d8c79a" strokeWidth="2" />
          <circle cx="588" cy="742" r="12" fill="#e2eefc" />
        </g>
      </g>

      {/* long roller on a pole (foreground, angled to the wall) */}
      <g>
        <line x1="1246" y1="612" x2="1128" y2="252" stroke="url(#rb-roller-pole)" strokeWidth="12" strokeLinecap="round" />
        <g transform="rotate(-18 1120 244)">
          <rect x="1058" y="224" width="124" height="42" rx="16" fill="#eef4ff" stroke="#9db6de" strokeWidth="2" />
          <rect x="1058" y="246" width="124" height="16" rx="8" fill="#2f6bff" />
          <rect x="1058" y="224" width="16" height="42" rx="8" fill="#cfe0f8" />
        </g>
        <rect x="1230" y="600" width="32" height="72" rx="11" fill="url(#rb-paint)" />
      </g>
    </svg>
  );
}

export default function RegisterBackground() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 55, damping: 18, mass: 0.7 });
  const sy = useSpring(py, { stiffness: 55, damping: 18, mass: 0.7 });

  useEffect(() => {
    if (reduce) return;
    function onMove(e: PointerEvent) {
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px, py]);

  // Each layer drifts opposite the pointer, deeper layers less than nearer ones.
  const farX = useTransform(sx, [-1, 1], [9, -9]);
  const farY = useTransform(sy, [-1, 1], [7, -7]);
  const midX = useTransform(sx, [-1, 1], [18, -18]);
  const midY = useTransform(sy, [-1, 1], [14, -14]);
  const nearX = useTransform(sx, [-1, 1], [30, -30]);
  const nearY = useTransform(sy, [-1, 1], [22, -22]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div className="absolute inset-0" style={{ x: farX, y: farY, scale: 1.1, filter: "blur(0.5px)" }}>
        <FarLayer />
      </motion.div>
      <motion.div className="absolute inset-0" style={{ x: midX, y: midY, scale: 1.09 }}>
        <MidLayer />
      </motion.div>
      <motion.div className="absolute inset-0" style={{ x: nearX, y: nearY, scale: 1.08 }}>
        <NearLayer />
      </motion.div>

      {/* soft vignette to settle the card into the scene */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(78% 62% at 50% 52%, transparent 42%, rgba(120,165,220,0.28) 100%)" }}
      />
    </div>
  );
}
