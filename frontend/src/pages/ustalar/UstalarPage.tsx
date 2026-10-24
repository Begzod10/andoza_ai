import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { getUstalar, createLead } from "@/lib/api";
import { isUzPhone } from "@/lib/phone";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Usta, UstalarParams } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Panel, Tile } from "@/components/ui/Panel";

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-500">
      <span aria-hidden="true">{"★".repeat(full)}<span className="text-ink/20">{"★".repeat(5 - full)}</span></span>
      <span className="text-ink-muted">{rating.toFixed(1)}</span>
    </span>
  );
}

function UstaCard({
  usta,
  onContact,
}: {
  usta: Usta;
  onContact: (usta: Usta) => void;
}) {
  const { t } = useTranslation()
  return (
    <Panel interactive className="flex animate-pop-in flex-col gap-4 p-5">
      <div className="flex items-start gap-3.5">
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] shadow-glow">
          {usta.avatar_url ? (
            <img src={usta.avatar_url} alt={usta.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-white">
              {usta.name?.[0] ?? "U"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-extrabold text-ink">{usta.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StarRating rating={usta.rating} />
            {usta.verified && (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-500">
                ✓ {t("ustalar.verified")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile className="p-3">
          <p className="text-xs font-medium text-ink-muted">{t("ustalar.tajriba")}</p>
          <p className="mt-0.5 text-lg font-extrabold tabular-nums text-ink">{usta.jobs_count}</p>
        </Tile>
        <Tile className="p-3">
          <p className="text-xs font-medium text-ink-muted">{t("ustalar.narx")}</p>
          <p className="mt-0.5 text-sm font-extrabold tabular-nums text-ink">
            {usta.price_min.toLocaleString()} – {usta.price_max.toLocaleString()}
          </p>
          <p className="text-[11px] text-ink-muted">{t("ustalar.soum_m2")}</p>
        </Tile>
      </div>

      <Button variant="primary" className="w-full" onClick={() => onContact(usta)}>
        {t("ustalar.usta_chaqirish")}
      </Button>
    </Panel>
  );
}

interface ContactModalProps {
  usta: Usta;
  /** The room the request is about (opened from its smeta), so the usta gets the room and its estimate. */
  roomId?: string;
  onClose: () => void;
}

function ContactModal({ usta, roomId, onClose }: ContactModalProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [success, setSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      createLead({ usta_id: usta.id, room_id: roomId, message, contact_phone: phone }),
    onSuccess: () => setSuccess(true),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md animate-fade-slide rounded-3xl bg-surface p-6 shadow-xl">
        {success ? (
          <div className="text-center py-6">
            <p className="text-4xl mb-4">✓</p>
            <h3 className="text-lg font-bold text-success mb-2">
              {t("ustalar.muvaffaqiyat")}
            </h3>
            <Button className="mt-4" onClick={onClose}>{t("common.yopish")}</Button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-neutral-900 mb-4">
              {t("ustalar.boglaning_ism", { name: usta.name })}
            </h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">
                  {t("auth.telefon")}
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }}
                  placeholder={t("auth.telefon_placeholder")}
                  className="mt-1 block w-full rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">
                  {t("ustalar.izoh")}
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full resize-none rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  placeholder={t("ustalar.izoh_placeholder")}
                />
              </label>
            </div>
            {phoneError ? (
              <p role="alert" className="mt-3 text-sm text-red-600">{t("common.telefon_xato")}</p>
            ) : mutation.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600">{t("errors.nomalum_xato")}</p>
            )}
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={onClose}>{t("common.bekor")}</Button>
              <Button
                className="flex-1"
                onClick={() => (isUzPhone(phone) ? mutation.mutate() : setPhoneError(true))}
                disabled={mutation.isPending || !phone}
              >
                {mutation.isPending ? t("common.yuklanmoqda") : t("ustalar.yuborish")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SORT_OPTIONS: { key: UstalarParams["sort"]; label: "ustalar.hammasi" | "ustalar.eng_yaxshi" | "ustalar.narxi_arzon" | "ustalar.narxi_qimmat" }[] = [
  { key: undefined, label: "ustalar.hammasi" },
  { key: "rating", label: "ustalar.eng_yaxshi" },
  { key: "price_asc", label: "ustalar.narxi_arzon" },
  { key: "price_desc", label: "ustalar.narxi_qimmat" },
];

export default function UstalarPage() {
  const { t } = useTranslation()
  const [sort, setSort] = useState<UstalarParams["sort"]>(undefined);
  const [selectedUsta, setSelectedUsta] = useState<Usta | null>(null);
  const roomId = useSearchParams()[0].get("room") ?? undefined;

  const { data: ustalar = [], isLoading, isError } = useQuery({
    queryKey: ["ustalar", sort],
    queryFn: () => getUstalar({ sort }),
  });

  return (
    <div className="min-h-screen bg-paper pb-28 lg:pb-8">
      <div className="mx-auto max-w-6xl px-5 pt-10 lg:px-6 lg:pt-6">
        {/* The title, what the page is for, and how the list is ordered. */}
        <Panel className="mb-5 flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight text-ink">{t("ustalar.sarlavha")}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t("ustalar.tavsif")}</p>
          </div>
          <div role="group" aria-label={t("ustalar.saralash")} className="flex flex-wrap gap-2 self-start">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={String(opt.key)}
                type="button"
                onClick={() => setSort(opt.key)}
                aria-pressed={sort === opt.key}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition-all",
                  sort === opt.key
                    ? "bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow"
                    : "bg-card-soft text-ink-muted hover:text-ink"
                )}
              >
                {t(opt.label)}
              </button>
            ))}
          </div>
        </Panel>

        <main>
          {isLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Panel key={i} className="h-56 animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <p className="py-8 text-center text-red-500">{t("errors.tarmoq_xatosi")}</p>
          )}

          {!isLoading && !isError && ustalar.length === 0 && (
            <p className="py-12 text-center text-on-app-muted">{t("empty.ustalar_yoq")}</p>
          )}

          {!isLoading && !isError && ustalar.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ustalar.map((usta) => (
                <UstaCard key={usta.id} usta={usta} onContact={setSelectedUsta} />
              ))}
            </div>
          )}
        </main>
      </div>

      {selectedUsta && (
        <ContactModal
          usta={selectedUsta}
          roomId={roomId}
          onClose={() => setSelectedUsta(null)}
        />
      )}
    </div>
  );
}
