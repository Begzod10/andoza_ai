// Do'kon (marketplace) screens after the shop home: product detail, dealers,
// cart, checkout and order tracking. `DokonPage.tsx` owns the state and hands
// each screen its data and callbacks.

import { useState, type ReactNode } from "react";
import {
  Check, ChevronLeft, Minus, Package, Phone, Plus, ShoppingCart, Trash2, Truck, XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatUZS } from "@/lib/utils";
import {
  ORDER_STATUSES, ORDER_STATUS_KEYS, ORDER_STATUS_STYLES, cancelledByLabel, formatWhen, orderStatusLabel, paymentLabel,
} from "@/lib/orderStatus";
import type { TKey } from "@/i18n";
import type { OrderStatus } from "@/lib/api/orders";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { IconBubble, Panel, Tile } from "@/components/ui/Panel";
import { isUzPhone } from "@/lib/phone";
import { ShopHome, type ShopBrowse } from "./ShopHome";

// ─── Shared pieces ────────────────────────────────────────────────────────────

function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-28 pt-5 lg:pb-10 lg:pt-6">{children}</div>;
}

function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  const { t } = useTranslation();
  return (
    <Panel className="flex items-center gap-3 px-3 py-2.5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.orqaga")}
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
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-card-soft p-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={t("dokon.screens.decrease")}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink transition-colors hover:bg-card disabled:opacity-40"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="min-w-8 text-center text-sm font-bold text-ink" aria-live="polite">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label={t("dokon.screens.increase")}
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
  onOrders?: () => void;
  browse?: ShopBrowse;
  onBrowseChange?: (browse: ShopBrowse) => void;
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
  const { t } = useTranslation();
  const items: Array<{ id: string; name_uz: string; price_uzs: number; unit: string; stage?: string; quantity?: number }> =
    Array.isArray(props.materials) ? props.materials : [];
  const total = items.reduce((sum, m) => sum + m.price_uzs * (m.quantity ?? 1), 0);

  return (
    <Screen>
      <ScreenHeader title={t("dokon.screens.project_materials")} subtitle={props.projectName} onBack={props.onBack} />
      {items.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-ink-muted">{t("dokon.screens.no_project_materials")}</Panel>
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
        <SummaryRow label={t("common.jami")} value={formatUZS(total)} strong />
        <Button size="lg" className="w-full" onClick={props.onAddToCart} disabled={items.length === 0}>
          {t("dokon.screens.add_to_cart")}
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
  const { t } = useTranslation();
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
              {priced ? formatUZS(props.price!) : t("dokon.screens.ask_price")}
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
          <h3 className="px-1 text-sm font-extrabold text-ink">{t("dokon.screens.dealers")}</h3>
          {props.dealers.map((d) => (
            <Tile key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{d.name}</p>
                {d.badge && <p className="text-xs font-semibold text-accent">{d.badge}</p>}
              </div>
              {d.phone && (
                <a
                  href={`tel:${d.phone.replace(/\s/g, "")}`}
                  aria-label={t("dokon.screens.call_dealer", { name: d.name })}
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
        <Stepper value={qty} onChange={(v) => setQty(Math.max(1, v))} label={t("dokon.screens.qty")} />
        <Button size="lg" variant="accent" className="flex-1" onClick={() => props.onAddToCart(props.id, qty)}
          disabled={!priced} leftIcon={<ShoppingCart size={18} aria-hidden="true" />}>
          {t("dokon.screens.add_to_cart")}
        </Button>
        {!priced && (
          <p className="w-full text-xs text-ink-muted">
            {t("dokon.screens.no_price_note")}
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
  const { t } = useTranslation();
  const dealers: Array<{
    id: string; name: string; price: number; deliveryFee: number; deliveryDays: string; isBest?: boolean; badge?: string;
  }> = Array.isArray(props.dealers) ? props.dealers : [];

  return (
    <Screen>
      <ScreenHeader title={t("dokon.screens.compare")} subtitle={props.productName} onBack={props.onBack} />
      {dealers.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-ink-muted">{t("dokon.screens.no_dealers")}</Panel>
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
                  {t("dokon.screens.best_price")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile className="px-3 py-2.5"><p className="text-[11px] text-ink-muted">{t("dokon.screens.price")}</p><p className="text-sm font-bold text-ink">{formatUZS(d.price)}</p></Tile>
              <Tile className="px-3 py-2.5"><p className="text-[11px] text-ink-muted">{t("dokon.screens.delivery")}</p><p className="text-sm font-bold text-ink">{formatUZS(d.deliveryFee)}</p></Tile>
              <Tile className="px-3 py-2.5"><p className="text-[11px] text-ink-muted">{t("dokon.screens.term")}</p><p className="text-sm font-bold text-ink">{d.deliveryDays}</p></Tile>
            </div>
            <Button className="w-full" onClick={() => props.onSelectDealer(d.id, d.name)}>{t("dokon.screens.choose")}</Button>
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
  const { t } = useTranslation();
  const items: Array<{ id: string; name: string; price: number; quantity: number; dealer: string; unit?: string }> =
    Array.isArray(props.items) ? props.items : [];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  if (items.length === 0) {
    return (
      <Screen>
        <ScreenHeader title={t("dokon.screens.cart_title")} onBack={props.onBack} />
        <Panel className="flex flex-col items-center gap-3 p-10 text-center">
          <IconBubble tone="blue" className="h-14 w-14"><ShoppingCart size={24} aria-hidden="true" /></IconBubble>
          <p className="text-base font-extrabold text-ink">{t("dokon.screens.cart_empty")}</p>
          <p className="text-sm text-ink-muted">{t("dokon.screens.cart_empty_hint")}</p>
          <Button className="mt-2" onClick={props.onBack}>{t("dokon.screens.back_to_shop")}</Button>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t("dokon.screens.cart_title")} subtitle={t("dokon.screens.items", { count: items.length })} onBack={props.onBack} />
      <Panel className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{i.name}</p>
              <p className="truncate text-xs text-ink-muted">{i.dealer}{i.unit ? ` · ${i.unit}` : ""}</p>
              <p className="mt-1 text-sm font-bold text-accent">{formatUZS(i.price * i.quantity)}</p>
            </div>
            <Stepper value={i.quantity} onChange={(v) => props.onUpdateQuantity(i.id, v)} min={0} label={t("dokon.screens.qty_of", { name: i.name })} />
            <button
              type="button"
              onClick={() => props.onRemove(i.id)}
              aria-label={t("dokon.screens.remove", { name: i.name })}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-card-soft text-ink-muted transition-colors hover:text-red-500"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
      </Panel>
      <Panel className="space-y-4 p-5">
        <SummaryRow label={t("dokon.screens.products")} value={formatUZS(subtotal)} strong />
        <p className="text-xs text-ink-muted">{t("dokon.screens.delivery_agreed")}</p>
        <Button size="lg" className="w-full" onClick={props.onCheckout}>{t("dokon.screens.place_order")}</Button>
      </Panel>
    </Screen>
  );
}

// ─── 6. Payment ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS: Array<{ value: "cash" | "card"; labelKey: TKey }> = [
  { value: "cash", labelKey: "dokon.order.payment.cash" },
  { value: "card", labelKey: "dokon.order.payment.card" },
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
  const { t } = useTranslation();
  const deliveryFee = props.deliveryFee ?? 0;
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [phoneError, setPhoneError] = useState(false);
  const ready = address.trim().length > 0 && phone.trim().length > 0 && !props.submitting;
  const error = phoneError ? t("common.telefon_xato") : props.error;

  return (
    <Screen>
      <ScreenHeader title={t("dokon.screens.payment_title")} subtitle={t("dokon.screens.items", { count: props.itemCount })} onBack={props.onBack} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          if (!isUzPhone(phone)) { setPhoneError(true); return; }
          props.onSubmit({ address: address.trim(), phone: phone.trim(), paymentMethod: method });
        }}
      >
        <Panel className="space-y-4 p-5">
          <h2 className="text-base font-extrabold text-ink">{t("dokon.screens.delivery_info")}</h2>
          <Input themed label={t("common.manzil")} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("dokon.screens.address_ph")} />
          <Input themed label={t("common.telefon")} type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }} placeholder="+998 90 123 45 67" />
        </Panel>

        <Panel className="space-y-3 p-5">
          <h2 className="text-base font-extrabold text-ink">{t("dokon.screens.payment_method")}</h2>
          <div className="flex gap-2" role="radiogroup" aria-label={t("dokon.screens.payment_method")}>
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
                {t(m.labelKey)}
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-3 p-5">
          <SummaryRow label={t("dokon.screens.products")} value={formatUZS(props.subtotal)} />
          {deliveryFee > 0 ? (
            <SummaryRow label={t("dokon.screens.delivery")} value={formatUZS(deliveryFee)} />
          ) : (
            <p className="text-xs text-ink-muted">{t("dokon.screens.delivery_agreed")}</p>
          )}
          <div className="border-t border-line pt-3">
            <SummaryRow label={t("common.jami")} value={formatUZS(props.subtotal + deliveryFee)} strong />
          </div>
          {error && (
            <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500">{error}</p>
          )}
          <Button type="submit" size="lg" variant="accent" className="mt-2 w-full" disabled={!ready} loading={props.submitting}>
            {t("dokon.screens.confirm_order")}
          </Button>
        </Panel>
      </form>
    </Screen>
  );
}

// ─── 7. Order tracking ────────────────────────────────────────────────────────

const ORDER_STEPS: Array<{ key: string; labelKey: TKey }> = ORDER_STATUSES.map((key) => ({
  key,
  labelKey: ORDER_STATUS_KEYS[key],
}));

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
  /** When the order was cancelled: by whom and why. */
  cancelledBy?: string | null;
  cancelReason?: string | null;
  /** Given to the buyer's view only: cancelling is offered while the shop has not started on the order. */
  onCancel?: () => void;
  cancelling?: boolean;
  cancelError?: string | null;
}) {
  const { t } = useTranslation();
  const cancelled = props.status === "cancelled";
  const current = Math.max(0, ORDER_STEPS.findIndex((s) => s.key === props.status));

  return (
    <Screen>
      <ScreenHeader title={t("dokon.screens.tracking_title")} subtitle={props.orderId} onBack={props.onBack} />

      <Panel className="p-5">
        {cancelled ? (
          <div role="status" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="flex items-center gap-2 text-base font-extrabold text-red-500">
              <XCircle size={18} aria-hidden="true" /> {t("dokon.screens.order_cancelled")}
            </p>
            {props.cancelledBy && (
              <p className="mt-1 text-xs text-ink-muted">{t("dokon.screens.cancelled_by", { who: cancelledByLabel(props.cancelledBy, t) })}</p>
            )}
            {props.cancelReason && <p className="mt-2 text-sm text-ink">{t("dokon.screens.reason", { reason: props.cancelReason })}</p>}
          </div>
        ) : (
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
                  {t(s.labelKey)}
                </p>
              </li>
            );
          })}
        </ol>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Tile className="px-3.5 py-3"><p className="text-[11px] text-ink-muted">{t("dokon.screens.order_date")}</p><p className="text-sm font-bold text-ink">{props.orderDate}</p></Tile>
          {props.dealerName && (
            <Tile className="px-3.5 py-3"><p className="text-[11px] text-ink-muted">{t("dokon.admin.dokon")}</p><p className="truncate text-sm font-bold text-ink">{props.dealerName}</p></Tile>
          )}
          {props.address && (
            <Tile className="col-span-2 px-3.5 py-3"><p className="text-[11px] text-ink-muted">{t("common.manzil")}</p><p className="text-sm font-bold text-ink">{props.address}</p></Tile>
          )}
          {props.phone && (
            <Tile className="col-span-2 px-3.5 py-3"><p className="text-[11px] text-ink-muted">{t("common.telefon")}</p><p className="text-sm font-bold text-ink">{props.phone}</p></Tile>
          )}
          {props.paymentMethod && (
            <Tile className="col-span-2 px-3.5 py-3"><p className="text-[11px] text-ink-muted">{t("dokon.screens.payment_method")}</p><p className="text-sm font-bold text-ink">{paymentLabel(props.paymentMethod, t)}</p></Tile>
          )}
        </div>
      </Panel>

      <Panel className="space-y-3 p-5">
        <h2 className="text-base font-extrabold text-ink">{t("dokon.screens.order_contents")}</h2>
        {props.items.map((i, idx) => (
          <div key={`${i.name}-${idx}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{i.name} <span className="text-ink-muted">× {i.quantity}</span></span>
            <span className="shrink-0 font-semibold text-ink">{formatUZS(i.price * i.quantity)}</span>
          </div>
        ))}
        <div className="border-t border-line pt-3">
          <SummaryRow label={t("common.jami")} value={formatUZS(props.total)} strong />
        </div>
        {props.cancelError && (
          <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-500">{props.cancelError}</p>
        )}
        {props.onCancel && props.status === "accepted" && (
          <Button variant="danger" className="w-full" loading={props.cancelling} onClick={props.onCancel}>
            {t("dokon.order.cancel_order")}
          </Button>
        )}
        {props.onCancel && (props.status === "gathering" || props.status === "on_the_way") && (
          <p className="text-center text-xs text-ink-muted">
            {t("dokon.screens.shop_started")}
          </p>
        )}
        <Button variant="soft" className="w-full" onClick={props.onBack}>{t("common.ortga")}</Button>
      </Panel>
    </Screen>
  );
}

// ─── 8. My orders ─────────────────────────────────────────────────────────────

export function S8_MyOrders(props: {
  orders: Array<{ id: string; dealer_name: string; total_uzs: number; status: string; created_at: string; lines: Array<{ product_name: string }> }> | undefined;
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  /** More orders wait on the server; fetched a page at a time. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const { t } = useTranslation();
  const orders = props.orders ?? [];
  return (
    <Screen>
      <ScreenHeader title={t("dokon.screens.my_orders")} onBack={props.onBack} />
      {props.loading ? (
        <div className="h-32 animate-pulse rounded-3xl bg-card" />
      ) : props.error ? (
        <Panel className="p-6 text-center text-sm font-medium text-red-500" role="alert">{props.error}</Panel>
      ) : orders.length === 0 ? (
        <Panel className="flex flex-col items-center gap-3 p-10 text-center">
          <IconBubble tone="blue" className="h-14 w-14"><Package size={24} aria-hidden="true" /></IconBubble>
          <p className="text-base font-extrabold text-ink">{t("dokon.screens.no_orders")}</p>
          <p className="text-sm text-ink-muted">{t("dokon.screens.no_orders_hint")}</p>
          <Button className="mt-2" onClick={props.onBack}>{t("dokon.screens.back_to_shop")}</Button>
        </Panel>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => props.onOpen(o.id)}
              aria-label={t("dokon.screens.order_aria", { id: o.id.slice(0, 8).toUpperCase(), status: orderStatusLabel(o.status, t) })}
              className="block w-full text-left"
            >
              <Panel interactive className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-ink">{o.dealer_name}</p>
                    <p className="text-xs text-ink-muted">№ {o.id.slice(0, 8).toUpperCase()} · {formatWhen(o.created_at)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ORDER_STATUS_STYLES[o.status as OrderStatus] ?? ORDER_STATUS_STYLES.accepted}`}>
                    {orderStatusLabel(o.status, t)}
                  </span>
                </div>
                <p className="truncate text-xs text-ink-muted">{o.lines.map((l) => l.product_name).join(", ")}</p>
                <p className="text-base font-extrabold text-ink">{formatUZS(o.total_uzs)}</p>
              </Panel>
            </button>
          ))}
          {props.hasMore && (
            <Button variant="soft" className="w-full" loading={props.loadingMore} onClick={props.onLoadMore}>
              {t("common.yana_yuklash")}
            </Button>
          )}
        </div>
      )}
    </Screen>
  );
}
