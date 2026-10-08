import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApartments, createApartment } from "@/lib/api";
import type { Apartment, CreateApartmentData } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { IconBubble, Panel, Tile } from "@/components/ui/Panel";

// ─── Stage Hero Card ──────────────────────────────────────────────────────────

const STAGES = [
  "Korobka", "Suvoq", "Shpaklovka", "Bo'yoq / Oboi",
  "Pol yotqizish", "Elektr / Santexnika", "Mebel", "Tayyor",
];

function HeroCard({ apartment }: { apartment?: Apartment }) {
  const [activeStage, setActiveStage] = useState(0);
  const navigate = useNavigate();

  const firstRoom = apartment?.rooms?.[0];
  const open = () => (firstRoom ? navigate(`/studio/${firstRoom.id}/ichkarida`) : navigate("/wizard"));

  return (
    <>
    {/* Desktop: the picture fills the card, the greeting, the stage and the play button sit on it. */}
    <div className="relative hidden h-full min-h-[300px] overflow-hidden rounded-3xl bg-neutral-800 lg:block">
      {firstRoom?.thumbnail_url ? (
        <img src={firstRoom.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-900">
          <svg width="220" height="165" viewBox="0 0 160 120" fill="none" aria-hidden="true" opacity="0.55">
            <polygon points="80,10 150,50 150,110 80,110 10,110 10,50" fill="#C9CFDD" stroke="#A0AAC0" strokeWidth="1.5"/>
            <polygon points="80,10 150,50 80,50" fill="#D8DEE9" stroke="#A0AAC0" strokeWidth="1.5"/>
            <polygon points="80,10 10,50 80,50" fill="#BFC8D9" stroke="#A0AAC0" strokeWidth="1.5"/>
          </svg>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/5 to-black/75" aria-hidden="true" />

      <div className="absolute inset-x-7 top-6 flex items-start justify-between text-white">
        <div>
          <p className="text-sm font-medium text-white/70">Xush kelibsiz</p>
          <p className="text-3xl font-extrabold leading-tight">Salom! 👋</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 backdrop-blur">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-warning" />
          <span className="text-sm font-bold">UyRemont</span>
        </div>
      </div>

      <div className="absolute inset-x-7 bottom-6 flex items-end justify-between gap-6 text-white">
        <div className="min-w-0">
          {apartment && (
            <p className="mb-1 truncate text-sm text-white/70">
              {apartment.name}{firstRoom ? ` · ${firstRoom.name}` : ""}
            </p>
          )}
          <p className="text-xs font-semibold text-white/70">Bosqich {activeStage + 1} / {STAGES.length}</p>
          <p className="text-2xl font-bold">{activeStage + 1}-bosqich: {STAGES[activeStage]}</p>
          <div className="mt-3 flex items-center gap-2">
            {STAGES.map((name, i) => (
              <button
                key={name}
                type="button"
                aria-label={`${i + 1}-bosqich: ${name}`}
                onClick={() => setActiveStage(i)}
                className={`h-2 rounded-full transition-all ${i === activeStage ? "w-7 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={open}
          aria-label={firstRoom ? "Loyihani ochish" : "Yangi loyiha boshlash"}
          className="flex h-14 flex-shrink-0 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#2F55D4] shadow-[0_14px_30px_-10px_rgba(0,0,0,0.5)] transition-transform hover:scale-105 active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M6 4l8 5-8 5V4z" fill="currentColor"/></svg>
          {firstRoom ? "Ochish" : "Boshlash"}
        </button>
      </div>
    </div>

    {/* Phone: the card as it was. */}
    <Panel className="mb-5 rounded-2xl p-4 lg:hidden">
      {/* 3D room placeholder */}
      <div className="rounded-2xl bg-neutral-100 h-48 flex items-center justify-center mb-4 overflow-hidden relative">
        {apartment ? (
          <>
            {firstRoom?.thumbnail_url ? (
              <img
                src={firstRoom.thumbnail_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
                  <polygon points="80,10 150,50 150,110 80,110 10,110 10,50" fill="#C9CFDD" stroke="#A0AAC0" strokeWidth="1.5"/>
                  <polygon points="80,10 150,50 80,50" fill="#D8DEE9" stroke="#A0AAC0" strokeWidth="1.5"/>
                  <polygon points="80,10 10,50 80,50" fill="#BFC8D9" stroke="#A0AAC0" strokeWidth="1.5"/>
                  <rect x="65" y="80" width="30" height="30" fill="#A0B4D6" rx="2"/>
                  <rect x="30" y="65" width="22" height="18" fill="#B8C8E8" rx="2"/>
                  <rect x="108" y="65" width="22" height="18" fill="#B8C8E8" rx="2"/>
                </svg>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 rounded-b-2xl px-3 py-2.5 flex items-center justify-between bg-neutral-900/70 backdrop-blur-sm">
              <div>
                <p className="text-white text-base font-bold leading-tight">{apartment.name}</p>
                <p className="text-[12px] mt-0.5 text-neutral-400">
                  {apartment.rooms?.[0]
                    ? `${apartment.rooms[0].name}`
                    : "Xona yo'q"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white/60 text-[11px]">Yaratilgan</p>
                <p className="text-white text-[11px] font-semibold">
                  {new Date(apartment.created_at).toLocaleDateString("uz-UZ")}
                </p>
              </div>
            </div>
          </>
        ) : (
          <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
            <polygon points="80,10 150,50 150,110 80,110 10,110 10,50" fill="#C9CFDD" stroke="#A0AAC0" strokeWidth="1.5"/>
            <polygon points="80,10 150,50 80,50" fill="#D8DEE9" stroke="#A0AAC0" strokeWidth="1.5"/>
            <polygon points="80,10 10,50 80,50" fill="#BFC8D9" stroke="#A0AAC0" strokeWidth="1.5"/>
          </svg>
        )}
      </div>

      {/* Stage dots */}
      <div className="flex items-center gap-2 mb-3">
        {STAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveStage(i)}
            className={`transition-all ${
              i === activeStage
                ? "w-6 h-2 rounded-full bg-brand"
                : "w-2 h-2 rounded-full bg-ink/20"
            }`}
          />
        ))}
      </div>

      {/* Stage info + play button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-ink-muted font-semibold">
            Bosqich {activeStage + 1} / {STAGES.length}
          </p>
          <p className="text-base font-bold text-ink mt-0.5">
            {activeStage + 1}-bosqich: {STAGES[activeStage]}
          </p>
        </div>
        <button
          onClick={() =>
            firstRoom
              ? navigate(`/studio/${firstRoom.id}/ichkarida`)
              : navigate("/wizard")
          }
          className="w-11 h-11 rounded-full bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] flex items-center justify-center flex-shrink-0 shadow-glow transition-transform active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6 4l8 5-8 5V4z" fill="white"/>
          </svg>
        </button>
      </div>
    </Panel>
    </>
  );
}

// ─── Desktop bento: the cards under the hero ──────────────────────────────────

function BentoCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <Panel className={`relative hidden min-h-0 flex-col overflow-hidden p-6 lg:flex ${className}`}>{children}</Panel>;
}

/** How much there is: projects, rooms, and where the latest one stands. */
function OverviewCard({ apartments }: { apartments: Apartment[] }) {
  const rooms = apartments.reduce((n, a) => n + (a.rooms?.length ?? 0), 0);
  return (
    <BentoCard>
      <p className="text-sm font-semibold text-ink-muted">Umumiy ko'rinish</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile className="p-4">
          <p className="text-4xl font-extrabold tabular-nums text-ink">{apartments.length}</p>
          <p className="text-xs font-medium text-ink-muted">loyiha</p>
        </Tile>
        <Tile className="p-4">
          <p className="text-4xl font-extrabold tabular-nums text-ink">{rooms}</p>
          <p className="text-xs font-medium text-ink-muted">xona</p>
        </Tile>
      </div>
      <p className="mt-auto pt-4 text-xs text-ink-muted">
        {apartments[0] ? `Oxirgisi: ${new Date(apartments[0].created_at).toLocaleDateString("uz-UZ")}` : ""}
      </p>
    </BentoCard>
  );
}

function LinkCard({
  title, text, action, to, tone, icon,
}: { title: string; text: string; action: string; to: string; tone: "orange" | "violet"; icon: React.ReactNode }) {
  const navigate = useNavigate();
  const glow = tone === "orange" ? "bg-orange-400/25" : "bg-violet-500/25";
  return (
    <BentoCard>
      {/* A soft colour in the corner, so the card has a face and is not a white slab with a button. */}
      <span aria-hidden="true" className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl ${glow}`} />
      <IconBubble tone={tone}>{icon}</IconBubble>
      <p className="mt-4 text-[19px] font-extrabold text-ink">{title}</p>
      <p className="mt-1.5 max-w-xs text-sm leading-snug text-ink-muted">{text}</p>
      <Button
        variant={tone === "orange" ? "accent" : "primary"}
        onClick={() => navigate(to)}
        className="mt-auto self-start"
        rightIcon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      >
        {action}
      </Button>
    </BentoCard>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ apt }: { apt: Apartment }) {
  const navigate = useNavigate();
  const firstRoom = apt.rooms?.[0];
  const open = () => (firstRoom ? navigate(`/studio/${firstRoom.id}/ichkarida`) : navigate("/wizard"));

  return (
    <Tile className="flex items-center gap-3 p-2.5 pr-3 transition-colors hover:bg-ink/5">
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card">
        {firstRoom?.thumbnail_url ? (
          <img src={firstRoom.thumbnail_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <polygon points="18,4 32,12 32,30 18,30 4,30 4,12" fill="#C9CFDD"/>
            <polygon points="18,4 32,12 18,12" fill="#D8DEE9"/>
            <polygon points="18,4 4,12 18,12" fill="#BFC8D9"/>
            <rect x="14" y="20" width="8" height="10" fill="#A0B4D6" rx="1"/>
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-ink">{apt.name}</p>
        <p className="mt-0.5 text-[12px] text-ink-muted">
          {new Date(apt.created_at).toLocaleDateString("uz-UZ")}
          {apt.rooms && apt.rooms.length > 0 && ` · ${apt.rooms.length} xona`}
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={open} className="flex-shrink-0">
        Ochish
      </Button>
    </Tile>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────

/**
 * Shown when the projects could not be loaded at all.
 *
 * Deliberately not the empty state: "Hali loyiha yo'q" is a statement about
 * the account, and showing it when the server is unreachable tells a user
 * their work is gone. Nothing has been lost — the list simply never arrived —
 * and the only useful thing to offer is another go.
 */
function ProjectsUnavailable({ onRetry, retrying }: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-5 text-center">
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B45309"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </div>
      <p className="text-[15px] font-bold text-amber-900">Loyihalar yuklanmadi</p>
      <p className="text-[13px] text-amber-800 mt-1">
        Serverga ulanib bo'lmadi. Loyihalaringiz joyida — ro'yxat kelmadi, xolos.
      </p>
      <Button variant="accent" className="mt-4" onClick={onRetry} disabled={retrying}>
        {retrying ? "Urinilmoqda..." : "Qayta urinish"}
      </Button>
    </div>
  );
}

function EmptyProjects({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-line bg-card-soft p-8 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-card">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
          <path d="M22 19.5H6a2 2 0 01-2-2V8a2 2 0 012-2h4l2 3h10a2 2 0 012 2v8.5a2 2 0 01-2 2z"/>
        </svg>
      </div>
      <p className="mb-4 text-[14px] text-ink-muted">
        Hali loyiha yo'q
      </p>
      <Button variant="accent" onClick={onCreateClick}>+ Yangi loyiha</Button>
    </div>
  );
}

// ─── Create Project Dialog ────────────────────────────────────────────────

function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const createMutation = useMutation({
    mutationFn: async (data: CreateApartmentData) => {
      return createApartment(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apartments"] });
      onOpenChange(false);
      setName("");
      setAddress("");
      navigate("/wizard");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({ name: name.trim(), address: address.trim() || undefined });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="w-full bg-white rounded-t-[24px] p-6 animate-in slide-in-from-bottom-5">
        <h2 className="text-[20px] font-bold text-gray-900 mb-6">Yangi loyiha</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[14px] font-semibold text-gray-900 mb-2">
              Loyiha nomi
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Tashkent, Shayxontohur"
              className="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-brand/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[14px] font-semibold text-gray-900 mb-2">
              Manzil (ixtiyoriy)
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Masalan: Abdulla Qodiriy ko'chasi, 123"
              className="w-full px-4 py-3 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-3 rounded-lg border border-neutral-300 text-neutral-900 font-semibold hover:bg-neutral-50 transition-colors"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="flex-1 px-4 py-3 rounded-lg bg-brand text-white font-semibold hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? "Yaratilmoqda..." : "Yaratish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [showDeleted, setShowDeleted] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: apartments = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["apartments", showDeleted],
    queryFn: async () => {
      try {
        return await getApartments(showDeleted);
      } catch (err) {
        if (err instanceof Error && err.message === "Unauthorized") return [];
        throw err;
      }
    },
    retry: false,
  });

  const latest = apartments.find(a => a.rooms && a.rooms.length > 0) ?? apartments[0];

  return (
    <div className="relative min-h-screen bg-paper pb-20 lg:h-screen lg:overflow-hidden lg:pb-0">
      {/* Phone: a column. Desktop: a grid of cards: the hero, the projects, and three smaller ones. */}
      <div className="px-5 pt-12 pb-4 lg:grid lg:h-full lg:grid-cols-12 lg:grid-rows-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-4 lg:p-4 lg:pt-4">

        <div className="lg:col-span-8 lg:row-start-1 lg:min-h-0">
          <div className="mb-5 flex items-center justify-between lg:hidden">
            <div>
              <p className="text-[15px] text-on-app-muted font-medium">Xush kelibsiz</p>
              <p className="text-[25px] font-extrabold text-on-app">Salom! 👋</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-warning" />
              <span className="text-sm font-bold text-brand">UyRemont</span>
            </div>
          </div>

          {isLoading ? (
            <div className="mb-5 h-64 animate-pulse rounded-[22px] bg-gray-200 lg:mb-0 lg:h-full lg:rounded-3xl" />
          ) : isError ? null : (
            <div className="lg:h-full">
              <HeroCard apartment={latest} />
            </div>
          )}
        </div>

        <div className="lg:col-span-4 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col lg:rounded-3xl lg:border lg:border-line lg:bg-card lg:p-5 lg:shadow-panel">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-extrabold text-on-app lg:text-ink">Mening loyihalarim</h2>
            <button
              onClick={() => setShowDeleted(!showDeleted)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                showDeleted
                  ? "bg-red-500/15 text-red-500"
                  : "bg-card text-brand-light hover:bg-card-soft lg:bg-card-soft"
              }`}
            >
              {showDeleted ? "🗑️ O'chirilganlar" : "Barchasi"}
            </button>
          </div>

          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 bg-gray-200 rounded-[18px] animate-pulse" />
                ))}
              </div>
            ) : isError ? (
              // NOT the empty state. A request that failed used to fall
              // through to "Hali loyiha yo'q", which tells a user with a
              // server down that their work is gone.
              <ProjectsUnavailable onRetry={() => refetch()} retrying={isFetching} />
            ) : apartments.length === 0 ? (
              <EmptyProjects onCreateClick={() => setShowCreateDialog(true)} />
            ) : (
              <div className="flex flex-col gap-3">
                {apartments.map((apt) => (
                  <ProjectCard key={apt.id} apt={apt} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop only: the row of smaller cards under the hero and the list. */}
        <div className="hidden lg:col-span-4 lg:row-start-2 lg:grid lg:min-h-0 lg:grid-rows-1">
          {/* Not while loading or after a failed load: with no list, "0 loyiha" would say the account is empty. */}
          {isLoading || isError ? <BentoCard>{null}</BentoCard> : <OverviewCard apartments={apartments} />}
        </div>
        <div className="hidden lg:col-span-4 lg:row-start-2 lg:grid lg:min-h-0 lg:grid-rows-1">
          <LinkCard
            title="Do'kon" text="Material va mebel narxlarini do'konlar bo'yicha solishtiring." action="Do'konni ochish" to="/dokon" tone="orange"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
          />
        </div>
        <div className="hidden lg:col-span-4 lg:row-start-2 lg:grid lg:min-h-0 lg:grid-rows-1">
          <LinkCard
            title="Ustalar" text="Tasdiqlangan ustalarni toping va ular bilan bog'laning." action="Ustalarni ko'rish" to="/ustalar" tone="violet"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          />
        </div>
      </div>

      {/* Floating Create Button */}
      {apartments.length > 0 && !isError && (
        <button
          onClick={() => setShowCreateDialog(true)}
          className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-gradient-to-br from-[#FB923C] to-[#EA580C] lg:hidden text-white flex items-center justify-center shadow-glow-orange active:scale-95 transition-all"
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M14 6v16M6 14h16" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      <CreateProjectDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
    </div>
  );
}
