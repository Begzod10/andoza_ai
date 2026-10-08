// Do'kon (marketplace) screens after the shop home: product detail, dealers,
// cart, checkout and order tracking. `DokonPage.tsx` owns the state and hands
// each screen its data and callbacks.

import { useState, type ReactNode } from "react";
import {
  Check, ChevronLeft, Minus, Package, Phone, Plus, ShoppingCart, Trash2, Truck,
} from "lucide-react";
import { formatUZS } from "@/lib/utils";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { IconBubble, Panel, Tile } from "@/components/ui/Panel";
import { ShopHome } from "./ShopHome";

// ─── Shared pieces ────────────────────────────────────────────────────────────

function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-28 pt-5 lg:pb-10 lg:pt-6">{children}</div>;
}

function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <Panel className="flex items-center gap-3 px-3 py-2.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Orqaga"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card-soft text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>
    </Panel>
  );
}

function Stepper({
  value, onChange, min = 1, label,
}: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-card-soft p-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Kamaytirish"
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-card disabled:opacity-40"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="min-w-8 text-center text-sm font-bold text-ink" aria-live="polite">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Ko'paytirish"
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-card"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? "text-base font-extrabold text-ink" : "text-sm text-ink-muted"}>{label}</span>
      <span className={strong ? "text-xl font-extrabold text-ink" : "text-sm font-semibold text-ink"}>{value}</span>
    </div>
  );
}

// ─── 1. Shop home ─────────────────────────────────────────────────────────────

export function S1_ShopHome(props: {
  cartCount: number;
  onCart: () => void;
  onProductSelect: (product: any) => void;
}) {
  return <ShopHome {...props} />;
}

// ─── 2. Materials for a project ───────────────────────────────────────────────

export function S2_ProjectMaterials(props: {
  projectName: string;
  materials: any;
  onAddToCart: () => void;
  onBack: () => void;
}) {
  const items: Array<{ id: string; name_uz: string; price_uzs: number; unit: string; stage?: string; quantity?: number }> =
    Array.isArray(props.materials) ? props.materials : [];
  const total = items.reduce((sum, m) => sum + m.price_uzs * (m.quantity ?? 1), 0);

  return (
    <Screen>
      <ScreenHeader title="Loyiha materiallari" subtitle={props.projectName} onBack={props.onBack} />
      {items.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-ink-muted">Bu loyiha uchun material topilmadi.</Panel>
      ) : (
        <Panel className="divide-y divide-line">
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-4">
              <IconBubble tone="orange" className="h-11 w-11"><Package size={18} aria-hidden="true" /></IconBubble>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{m.name_uz}</p>
                <p className="text-xs text-ink-muted">
                  {m.quantity ?? 1} {m.unit}{m.stage ? ` · ${m.stage}` : ""}
                </p>
              </div>
              <p className="text-sm font-bold text-ink">{formatUZS(m.price_uzs * (m.quantity ?? 1))}</p>
            </div>
          ))}
        </Panel>
      )}
      <Panel className="space-y-4 p-5">
        <SummaryRow label="Jami" value={formatUZS(total)} strong />
        <Button size="lg" className="w-full" onClick={props.onAddToCart} disabled={items.length === 0}>
          Savatga qo'shish
        </Button>
      </Panel>
    </Screen>
  );
}

// ─── 3. Product detail ────────────────────────────────────────────────────────

export function S3_ProductDetail(props: {
  id: string;
  name: string;
  /** null when the shop has not set a price yet. */
  price: number | null;
  images: string[];
  specs: Array<{ label: string; value: string }>;
  dealers: Array<{ id: string; name: string; phone: string; url: string; badge?: string }>;
  description: string;
  onAddToCart: (productId: string, quantity: number) => void;
  onBack: () => void;
}) {
  const [qty, setQty] = useState(1);
  const priced = props.price != null && props.price > 0;
  const image = props.images[0];

  return (
    <Screen>
      <ScreenHeader title={props.name} onBack={props.onBack} />

      <Panel className="overflow-hidden">
        <div className="flex aspect-[4/3] max-h-80 w-full items-center justify-center bg-card-soft">
          {image ? (
            <img src={image} alt={props.name} className="h-full w-full object-cover" />
          ) : (
            <Package size={56} className="text-ink-muted" aria-hidden="true" />
          )}
        </div>
        <div className="space-y-4 p-5">
          <div>
            <h2 className="text-xl font-extrabold text-ink">{props.name}</h2>
            <p className="mt-1 text-2xl font-extrabold text-accent">
              {priced ? formatUZS(props.price!) : "Narx so'rang"}
            </p>
          </div>
          {props.description && <p className="text-sm text-ink-muted">{props.description}</p>}

          {props.specs.length > 0 && (
            <dl className="grid grid-cols-2 gap-2.5">
              {props.specs.map((s) => (
                <Tile key={s.label} className="px-3.5 py-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{s.label}</dt>
                  <dd className="mt-0.5 text-sm font-bold text-ink">{s.value}</dd>
                </Tile>
              ))}
            </dl>
          )}
        </div>
      </Panel>

      {props.dealers.length > 0 && (
        <Panel className="space-y-2 p-4">
          <h3 className="px-1 text-sm font-extrabold text-ink">Sotuvchilar</h3>
          {props.dealers.map((d) => (
            <Tile key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{d.name}</p>
                {d.badge && <p className="text-xs font-semibold text-accent">{d.badge}</p>}
              </div>
              {d.phone && (
                <a
                  href={`tel:${d.phone.replace(/\s/g, "")}`}
                  aria-label={`${d.name} ga qo'ng'iroq`}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-ink-muted transition-colors hover:text-accent"
                >
                  <Phone size={16} aria-hidden="true" />
                </a>
              )}
            </Tile>
          ))}
        </Panel>
      )}

      <Panel className="flex flex-wrap items-center justify-between gap-4 p-4">
        <Stepper value={qty} onChange={(v) => setQty(Math.max(1, v))} label="Miqdor" />
        <Button size="lg" variant="accent" className="flex-1" onClick={() => props.onAddToCart(props.id, qty)}
          disabled={!priced} leftIcon={<ShoppingCart size={18} aria-hidden="true" />}>
          Savatga qo'shish
        </Button>
        {!priced && (
          <p className="w-full text-xs text-ink-muted">
            Bu mahsulotning narxi belgilanmagan: sotuvchidan so'rang, savatga qo'shib bo'lmaydi.
          </p>
        )}
      </Panel>
    </Screen>
  );
}

// ─── 4. Dealer comparison ─────────────────────────────────────────────────────

export function S4_DealerComparison(props: {
  productName: string;
  dealers: any;
  onSelectDealer: (dealerId: string, dealerName: string) => void;
  onBack: () => void;
}) {
  const dealers: Array<{
    id: string; name: string; price: number; deliveryFee: number; deliveryDays: string; isBest?: boolean; badge?: string;
  }> = Array.isArray(props.dealers) ? props.dealers : [];

  return (
    <Screen>
      <ScreenHeader title="Dilerlarni taqqoslash" subtitle={props.productName} onBack={props.onBack} />
      {dealers.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-ink-muted">Hozircha diler topilmadi.</Panel>
      ) : (
        dealers.map((d) => (
          <Panel key={d.id} className={`space-y-4 p-5 ${d.isBest ? "ring-2 ring-[#5B84F5]/60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-extrabold text-ink">{d.name}</h2>
                {d.badge && <p className="text-xs font-semibold text-accent">{d.badge}</p>}
              </div>
              {d.isBest && (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-500">
                  Eng yaxshi narx
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile className="px-3 py-2.5"><p className="text-[11px] text-ink-muted">Narx</p><p className="text-sm font-bold text-ink">{formatUZS(d.price)}</p></Tile>
              <Tile className="px-3 py-2.5"><p className="text-[11px] text-ink-muted">Yetkazish</p><p className="text-sm font-bold text-ink">{formatUZS(d.deliveryFee)}</p></Tile>
              <Tile className="px-3 py-2.5"><p className="text-[11px] text-ink-muted">Muddat</p><p className="text-sm font-bold text-ink">{d.deliveryDays}</p></Tile>
            </div>
            <Button className="w-full" onClick={() => props.onSelectDealer(d.id, d.name)}>Tanlash</Button>
          </Panel>
        ))
      )}
    </Screen>
  );
}

// ─── 5. Cart ──────────────────────────────────────────────────────────────────

export function S5_Cart(props: {
  items: any;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onCheckout: () => void;
  onBack: () => void;
}) {
  const items: Array<{ id: string; name: string; price: number; quantity: number; dealer: string; unit?: string }> =
    Array.isArray(props.items) ? props.items : [];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  if (items.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Savat" onBack={props.onBack} />
        <Panel className="flex flex-col items-center gap-3 p-10 text-center">
          <IconBubble tone="blue" className="h-14 w-14"><ShoppingCart size={24} aria-hidden="true" /></IconBubble>
          <p className="text-base font-extrabold text-ink">Savat bo'sh</p>
          <p className="text-sm text-ink-muted">Do'kondan kerakli mahsulotlarni tanlang.</p>
          <Button className="mt-2" onClick={props.onBack}>Do'konga qaytish</Button>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Savat" subtitle={`${items.length} ta mahsulot`} onBack={props.onBack} />
      <Panel className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{i.name}</p>
              <p className="truncate text-xs text-ink-muted">{i.dealer}{i.unit ? ` · ${i.unit}` : ""}</p>
              <p className="mt-1 text-sm font-bold text-accent">{formatUZS(i.price * i.quantity)}</p>
            </div>
            <Stepper value={i.quantity} onChange={(v) => props.onUpdateQuantity(i.id, v)} min={0} label={`${i.name} miqdori`} />
            <button
              type="button"
              onClick={() => props.onRemove(i.id)}
              aria-label={`${i.name} ni olib tashlash`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-card-soft text-ink-muted transition-colors hover:text-red-500"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
      </Panel>
      <Panel className="space-y-4 p-5">
        <SummaryRow label="Mahsulotlar" value={formatUZS(subtotal)} strong />
        <p className="text-xs text-ink-muted">Yetkazish narxi do'kon bilan kelishiladi.</p>
        <Button size="lg" className="w-full" onClick={props.onCheckout}>Buyurtma berish</Button>
      </Panel>
    </Screen>
  );
}

// ─── 6. Payment ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS: Array<{ value: "cash" | "card"; label: string }> = [
  { value: "cash", label: "Naqd pul" },
  { value: "card", label: "Karta" },
];

export function S6_Payment(props: {
  subtotal: number;
  /** Only shown when a real fee is known; 0 means "agreed with the shop". */
  deliveryFee?: number;
  itemCount: number;
  onSubmit: (data: { address: string; phone: string; paymentMethod: "cash" | "card" }) => void;
  onBack: () => void;
  submitting?: boolean;
  /** Why the last attempt failed; the cart is untouched so they can try again. */
  error?: string | null;
}) {
  const deliveryFee = props.deliveryFee ?? 0;
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const ready = address.trim().length > 0 && phone.trim().length > 0 && !props.submitting;

  return (
    <Screen>
      <ScreenHeader title="To'lov" subtitle={`${props.itemCount} ta mahsulot`} onBack={props.onBack} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) props.onSubmit({ address: address.trim(), phone: phone.trim(), paymentMethod: method });
        }}
      >
        <Panel className="space-y-4 p-5">
          <h2 className="text-base font-extrabold text-ink">Yetkazish ma'lumotlari</h2>
          <Input themed label="Manzil" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shahar, ko'cha, uy" />
          <Input themed label="Telefon" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
        </Panel>

        <Panel className="space-y-3 p-5">
          <h2 className="text-base font-extrabold text-ink">To'lov usuli</h2>
          <div className="flex gap-2" role="radiogroup" aria-label="To'lov usuli">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={method === m.value}
                onClick={() => setMethod(m.value)}
                className={`flex-1 rounded-full border px-4 py-2.5 text-sm font-bold transition-all ${
                  method === m.value
                    ? "border-transparent bg-gradient-to-br from-[#5B84F5] to-[#3D5FD6] text-white shadow-glow"
                    : "border-line bg-card-soft text-ink hover:border-[#5B84F5]/60"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-3 p-5">
          <SummaryRow label="Mahsulotlar" value={formatUZS(props.subtotal)} />
          {deliveryFee > 0 ? (
            <SummaryRow label="Yetkazish" value={formatUZS(deliveryFee)} />
          ) : (
            <p className="text-xs text-ink-muted">Yetkazish narxi do'kon bilan kelishiladi.</p>
          )}
          <div className="border-t border-line pt-3">
            <SummaryRow label="Jami" value={formatUZS(props.subtotal + deliveryFee)} strong />
          </div>
          {props.error && (
            <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500">{props.error}</p>
          )}
          <Button type="submit" size="lg" variant="accent" className="mt-2 w-full" disabled={!ready} loading={props.submitting}>
            Buyurtmani tasdiqlash
          </Button>
        </Panel>
      </form>
    </Screen>
  );
}

// ─── 7. Order tracking ────────────────────────────────────────────────────────

const ORDER_STEPS: Array<{ key: string; label: string }> = ORDER_STATUSES.map((key) => ({
  key,
  label: ORDER_STATUS_LABELS[key],
}));

const PAYMENT_LABEL: Record<string, string> = { cash: "Naqd pul", card: "Karta" };

export function S7_OrderTracking(props: {
  orderId: string;
  /** The shop it was ordered from. */
  dealerName?: string;
  status: string;
  orderDate: string;
  address?: string | null;
  phone?: string | null;
  paymentMethod?: string | null;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  onBack: () => void;
}) {
  const current = Math.max(0, ORDER_STEPS.findIndex((s) => s.key === props.status));

  return (
    <Screen>
      <ScreenHeader title="Buyurtma holati" subtitle={props.orderId} onBack={props.onBack} />

      <Panel className="p-5">
        <ol className="space-y-0">
          {ORDER_STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={s.key} className="flex gap-3" aria-current={active ? "step" : undefined}>
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${
                      done ? "bg-emerald-500" : active ? "bg-gradient-to-br from-[#5B84F5] to-[#3D5FD6] shadow-glow" : "bg-card-soft"
                    }`}
                  >
                    {done ? <Check size={15} aria-hidden="true" /> : active ? <Truck size={15} aria-hidden="true" /> : null}
                  </span>
                  {i < ORDER_STEPS.length - 1 && <span className={`my-1 w-0.5 flex-1 min-h-5 ${done ? "bg-emerald-500" : "bg-line"}`} />}
                </div>
                <p className={`pb-4 pt-1 text-sm ${active ? "font-extrabold text-ink" : done ? "font-semibold text-ink" : "text-ink-muted"}`}>
                  {s.label}
                </p>
              </li>
            );
          })}
        </ol>
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          <Tile className="px-3.5 py-3"><p className="text-[11px] text-ink-muted">Buyurtma sanasi</p><p className="text-sm font-bold text-ink">{props.orderDate}</p></Tile>
          {props.dealerName && (
            <Tile className="px-3.5 py-3"><p className="text-[11px] text-ink-muted">Do'kon</p><p className="truncate text-sm font-bold text-ink">{props.dealerName}</p></Tile>
          )}
          {props.address && (
            <Tile className="col-span-2 px-3.5 py-3"><p className="text-[11px] text-ink-muted">Manzil</p><p className="text-sm font-bold text-ink">{props.address}</p></Tile>
          )}
          {props.phone && (
            <Tile className="px-3.5 py-3"><p className="text-[11px] text-ink-muted">Telefon</p><p className="text-sm font-bold text-ink">{props.phone}</p></Tile>
          )}
          {props.paymentMethod && (
            <Tile className="px-3.5 py-3"><p className="text-[11px] text-ink-muted">To'lov usuli</p><p className="text-sm font-bold text-ink">{PAYMENT_LABEL[props.paymentMethod] ?? props.paymentMethod}</p></Tile>
          )}
        </div>
      </Panel>

      <Panel className="space-y-3 p-5">
        <h2 className="text-base font-extrabold text-ink">Buyurtma tarkibi</h2>
        {props.items.map((i, idx) => (
          <div key={`${i.name}-${idx}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{i.name} <span className="text-ink-muted">× {i.quantity}</span></span>
            <span className="shrink-0 font-semibold text-ink">{formatUZS(i.price * i.quantity)}</span>
          </div>
        ))}
        <div className="border-t border-line pt-3">
          <SummaryRow label="Jami" value={formatUZS(props.total)} strong />
        </div>
        <Button variant="soft" className="w-full" onClick={props.onBack}>Do'konga qaytish</Button>
      </Panel>
    </Screen>
  );
}
