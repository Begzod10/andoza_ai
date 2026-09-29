import * as THREE from "three";

/**
 * The switches and sockets on the wall, after the Chameleon range the user
 * supplied: matte charcoal plates with a stepped bezel, a recessed field, and
 * the working part — rocker or socket dish — sitting in it.
 *
 * They were flat off-white boxes with a navy-blue rectangle for a rocker and
 * two navy pegs for a socket, which read as a sticker on the wall rather than
 * a fitting in it. Everything here is built from the range's own proportions:
 * an 80 mm square plate for the one- and two-gang units, a 150 mm plate where
 * two round sockets sit side by side, and the earth pin standing proud in the
 * dish the way a type-E socket's does.
 *
 * Geometry only — the dragging, the wall frame and the press-and-hold to
 * delete all stay in ElectricalComponents.
 */

/** How far the whole plate stands off the wall. */
export const PLATE_T = 0.006;
/** The engraved step around the edge — the range's one piece of detailing. */
const BEZEL_INSET = 0.005;
/** The recessed field the working part sits in. */
const FIELD_INSET = 0.009;
const FIELD_DROP = 0.0015;

const PLATE = '#2C2C2E';
const BEZEL = '#37373A';
const FIELD = '#242427';
const ROCKER = '#313134';
const DISH = '#1E1E20';
const HOLE = '#111113';
const PIN = '#9A9A9E';

/** Every part of these is the same moulded matte plastic. */
function Plastic({ color, ...rest }: { color: string } & Record<string, unknown>) {
  return <meshStandardMaterial color={color} roughness={0.62} metalness={0.04} {...rest} />;
}

/** A socket's round dish: the recess, its two pin holes, and the earth pin. */
function SocketDish({ x }: { x: number }) {
  const R = 0.0235;
  return (
    <group position={[x, 0, 0]}>
      {/* The dish, sunk into the field. */}
      <mesh position={[0, 0, -FIELD_DROP]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[R, R, 0.004, 32]} />
        <Plastic color={DISH} />
      </mesh>
      {/* Its rim, so the dish reads as sunk rather than drawn on. */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[R + 0.0015, R + 0.0015, 0.0012, 32]} />
        <Plastic color={BEZEL} />
      </mesh>
      {[-0.0095, 0.0095].map((hx) => (
        <mesh key={hx} position={[hx, 0, -0.0005]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0042, 0.0042, 0.006, 16]} />
          <Plastic color={HOLE} roughness={0.9} />
        </mesh>
      ))}
      {/* The earth pin, standing proud — the one metal part of the fitting. */}
      <mesh position={[0, 0.011, 0.0015]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0022, 0.0022, 0.007, 12]} />
        <meshStandardMaterial color={PIN} metalness={0.75} roughness={0.34} />
      </mesh>
    </group>
  );
}

/** A rocker: one gang of a switch, standing a little proud of the field. */
function Rocker({ x, w, h }: { x: number; w: number; h: number }) {
  return (
    <mesh position={[x, 0, 0.0015]}>
      <boxGeometry args={[w, h, 0.004]} />
      <Plastic color={ROCKER} roughness={0.5} />
    </mesh>
  );
}

/** A data outlet — TV, Ethernet, aerial — as a sunk port with its shutter. */
function DataPort({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0, -FIELD_DROP]}>
        <boxGeometry args={[0.019, 0.026, 0.004]} />
        <Plastic color={DISH} />
      </mesh>
      <mesh position={[0, -0.004, -0.0005]}>
        <boxGeometry args={[0.013, 0.012, 0.005]} />
        <Plastic color={HOLE} roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * The plate itself, for any faceplate type. `w`/`h` are the plate's real size;
 * the working parts are laid out from the field it leaves.
 */
export function Faceplate({ type, w, h, isDragging }: {
  type: string;
  w: number;
  h: number;
  /** Tinted while the fitting is being slid along the wall. */
  isDragging?: boolean;
}) {
  const fieldW = w - FIELD_INSET * 2;
  const fieldH = h - FIELD_INSET * 2;
  const glow = isDragging
    ? { emissive: new THREE.Color('#4466AA'), emissiveIntensity: 0.25 }
    : {};

  let insert: React.ReactNode = null;
  if (type === 'switch1') {
    insert = <Rocker x={0} w={fieldW - 0.006} h={fieldH - 0.006} />;
  } else if (type === 'switch2') {
    // Two gangs on one 80 mm plate, as the range does it — not two plates.
    const gw = (fieldW - 0.0085) / 2;
    insert = (
      <>
        <Rocker x={-(gw + 0.0015) / 2} w={gw} h={fieldH - 0.006} />
        <Rocker x={(gw + 0.0015) / 2} w={gw} h={fieldH - 0.006} />
      </>
    );
  } else if (type === 'socket_media') {
    insert = <>{[-0.0335, 0, 0.0335].map((x) => <DataPort key={x} x={x} />)}</>;
  } else if (type === 'socket2') {
    insert = <>{[-0.0335, 0.0335].map((x) => <SocketDish key={x} x={x} />)}</>;
  } else {
    insert = <SocketDish x={0} />;
  }

  return (
    <group>
      {/* The plate, standing off the wall. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, PLATE_T]} />
        <Plastic color={PLATE} {...glow} />
      </mesh>
      {/* The step round the edge: a slightly smaller face sitting proud of
          the plate, which is what casts the range's fine shadow line. */}
      <mesh position={[0, 0, PLATE_T / 2]}>
        <boxGeometry args={[w - BEZEL_INSET * 2, h - BEZEL_INSET * 2, 0.0012]} />
        <Plastic color={BEZEL} {...glow} />
      </mesh>
      {/* The field, sunk back again — everything else sits in this. */}
      <group position={[0, 0, PLATE_T / 2 + 0.0006]}>
        <mesh position={[0, 0, -FIELD_DROP / 2]}>
          <boxGeometry args={[fieldW, fieldH, FIELD_DROP]} />
          <Plastic color={FIELD} {...glow} />
        </mesh>
        {insert}
      </group>
    </group>
  );
}
