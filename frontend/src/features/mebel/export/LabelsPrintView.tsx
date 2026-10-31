import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { partName } from "@/features/mebel/ui/format";
import type { LabelFormat, PartLabel } from "./labels";

/** Label sizes: an A4 sheet of 3 × 8 stickers, or one sticker per page off a roll. */
const SIZE = { a4: { w: 70, h: 37 }, roll: { w: 58, h: 40 } } as const;
const PAGE_CSS = {
  a4: "@page { size: A4 portrait; margin: 0 }",
  roll: "@page { size: 58mm 40mm; margin: 0 }",
} as const;

/** A QR code as SVG squares, drawn the same on screen and in print. */
function Qr({ text, size }: { text: string; size: string }) {
  const { size: n, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  const cells: JSX.Element[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (data[y * n + x]) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />);
  }
  return (
    <svg data-testid="qr" viewBox={`-1 -1 ${n + 2} ${n + 2}`} style={{ width: size, height: size }} shapeRendering="crispEdges">
      {cells}
    </svg>
  );
}

/** The part drawn small, a band shown as a thick side with its thickness. */
function Bands({ edges }: { edges: PartLabel["edges"] }) {
  const w = (t: number | null) => (t == null ? 0.6 : t >= 1 ? 2.4 : 1.4);
  return (
    <svg viewBox="0 0 40 22" style={{ width: "15mm", height: "8.3mm" }} aria-hidden="true">
      <line x1="4" y1="18" x2="36" y2="18" stroke="#000" strokeWidth={w(edges.L1)} />
      <line x1="4" y1="4" x2="36" y2="4" stroke="#000" strokeWidth={w(edges.L2)} />
      <line x1="36" y1="4" x2="36" y2="18" stroke="#000" strokeWidth={w(edges.W1)} />
      <line x1="4" y1="4" x2="4" y2="18" stroke="#000" strokeWidth={w(edges.W2)} />
    </svg>
  );
}

/**
 * What prints for "Yorliqlar": one sticker per part with its id, name, size,
 * bands, grain and a QR code that opens the part on a phone. Hidden on screen.
 */
export function LabelsPrintView({ projectName, labels, format }: { projectName: string; labels: PartLabel[]; format: LabelFormat }) {
  const { t } = useTranslation();
  const { w, h } = SIZE[format];
  const band = (v: number | null) => (v == null ? "—" : String(v));
  return (
    <div data-testid="mebel-labels" aria-hidden="true"
      className={`hidden text-black ${format === "a4" ? "print:grid" : "print:block"}`}
      style={format === "a4" ? { gridTemplateColumns: `repeat(3, ${w}mm)`, gridAutoRows: `${h}mm` } : undefined}>
      <style>{PAGE_CSS[format]}</style>
      {labels.map((l) => (
        <div key={l.partId} data-testid="label"
          style={{
            width: `${w}mm`, height: `${h}mm`, padding: "2mm", boxSizing: "border-box", overflow: "hidden",
            display: "flex", gap: "2mm", breakInside: "avoid", ...(format === "roll" ? { breakAfter: "page" } : {}),
          }}>
          <div style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", fontSize: "7pt", lineHeight: 1.2 }}>
            <div style={{ fontSize: "13pt", fontWeight: 700, lineHeight: 1.1 }}>{l.partId}</div>
            <div style={{ fontWeight: 700 }}>{partName(l.role)}</div>
            <div style={{ fontSize: "9pt", fontWeight: 700 }}>{`${l.length} × ${l.width} × ${l.thickness}`}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "1mm" }}>
              <Bands edges={l.edges} />
              <span>{`${band(l.edges.L1)} · ${band(l.edges.L2)} · ${band(l.edges.W1)} · ${band(l.edges.W2)}`}</span>
            </div>
            <div style={{ marginTop: "auto", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {`${l.cabinet} · ${projectName}${l.grain === "none" ? "" : ` · ${t(`mebel.grain.${l.grain}`)}`}`}
            </div>
          </div>
          <Qr text={l.url} size={`${Math.min(h - 4, 24)}mm`} />
        </div>
      ))}
    </div>
  );
}
