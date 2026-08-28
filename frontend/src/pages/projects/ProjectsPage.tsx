import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApartments, createApartment } from "@/lib/api";
import type { Apartment, CreateApartmentData } from "@/lib/api";

// ─── Stage Hero Card ──────────────────────────────────────────────────────────

const STAGES = [
  "Korobka", "Suvoq", "Shpaklovka", "Bo'yoq / Oboi",
  "Pol yotqizish", "Elektr / Santexnika", "Mebel", "Tayyor",
];

function HeroCard({ apartment }: { apartment?: Apartment }) {
  const [activeStage, setActiveStage] = useState(0);
  const navigate = useNavigate();

  const firstRoom = apartment?.rooms?.[0];

  return (
    <div className="rounded-xl border border-neutral-200 p-4 mb-5 bg-white shadow-sm">
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
                : "w-2 h-2 rounded-full bg-gray-300"
            }`}
          />
        ))}
      </div>

      {/* Stage info + play button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] text-muted font-semibold">
            Bosqich {activeStage + 1} / {STAGES.length}
          </p>
          <p className="text-base font-bold text-gray-900 mt-0.5">
            {activeStage + 1}-bosqich: {STAGES[activeStage]}
          </p>
        </div>
        <button
          onClick={() =>
            firstRoom
              ? navigate(`/studio/${firstRoom.id}/ichkarida`)
              : navigate("/wizard")
          }
          className="w-11 h-11 rounded-full bg-brand flex items-center justify-center flex-shrink-0 shadow-btn hover:shadow-hover transition-shadow"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6 4l8 5-8 5V4z" fill="white"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ apt }: { apt: Apartment }) {
  const navigate = useNavigate();
  const firstRoom = apt.rooms?.[0];

  return (
    <div className="flex items-center gap-3 bg-white border border-neutral-200 rounded-xl p-3 shadow-sm">
      <div className="w-14 h-14 rounded-xl bg-neutral-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
        {firstRoom?.thumbnail_url ? (
          <img src={firstRoom.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <polygon points="18,4 32,12 32,30 18,30 4,30 4,12" fill="#C9CFDD"/>
            <polygon points="18,4 32,12 18,12" fill="#D8DEE9"/>
            <polygon points="18,4 4,12 18,12" fill="#BFC8D9"/>
            <rect x="14" y="20" width="8" height="10" fill="#A0B4D6" rx="1"/>
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-gray-900 truncate">{apt.name}</p>
        <p className="text-[12px] text-muted mt-0.5">
          {new Date(apt.created_at).toLocaleDateString("uz-UZ")}
          {apt.rooms && apt.rooms.length > 0 && ` · ${apt.rooms.length} xona`}
        </p>
      </div>
      <button
        onClick={() =>
          firstRoom
            ? navigate(`/studio/${firstRoom.id}/ichkarida`)
            : navigate("/wizard")
        }
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-brand bg-primary-tint flex-shrink-0 hover:bg-primary/10 transition-colors"
      >
        Ochish
      </button>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────

function EmptyProjects({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="rounded-xl p-8 flex flex-col items-center text-center border-2 border-dashed border-neutral-300 bg-neutral-50">
      <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mb-3">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
          <path d="M22 19.5H6a2 2 0 01-2-2V8a2 2 0 012-2h4l2 3h10a2 2 0 012 2v8.5a2 2 0 01-2 2z"/>
        </svg>
      </div>
      <p className="text-[14px] text-muted mb-4">
        Hali loyiha yo'q
      </p>
      <button
        onClick={onCreateClick}
        className="px-4 py-2 rounded-[12px] bg-brand text-white text-[14px] font-semibold hover:bg-brand/90"
      >
        + Yangi loyiha
      </button>
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

  const { data: apartments = [], isLoading } = useQuery({
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
    <div className="min-h-screen bg-paper relative pb-20">
      <div className="px-5 pt-12 pb-4 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-10">

        <div className="lg:grid lg:grid-cols-5 lg:gap-10">

          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[15px] text-muted font-medium">Xush kelibsiz</p>
                <p className="text-[25px] font-extrabold text-gray-900">Salom! 👋</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-100">
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-warning" />
                <span className="text-sm font-bold text-brand">UyRemont</span>
              </div>
            </div>

            {isLoading ? (
              <div className="rounded-[22px] bg-gray-200 h-64 animate-pulse mb-5" />
            ) : (
              <HeroCard apartment={latest} />
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3 lg:mt-0 lg:pt-0">
              <h2 className="text-[17px] font-extrabold text-gray-900">Mening loyihalarim</h2>
              <button
                onClick={() => setShowDeleted(!showDeleted)}
                className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  showDeleted
                    ? "bg-red-100 text-red-600"
                    : "text-brand hover:bg-blue-50"
                }`}
              >
                {showDeleted ? "🗑️ O'chirilganlar" : "Barchasi"}
              </button>
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-20 bg-gray-200 rounded-[18px] animate-pulse" />
                ))}
              </div>
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
      </div>

      {/* Floating Create Button */}
      {apartments.length > 0 && (
        <button
          onClick={() => setShowCreateDialog(true)}
          className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center shadow-btn hover:shadow-hover hover:bg-brand/90 transition-all"
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
