import { useState } from "react";
import { ChevronRight, Calculator, FolderOpen, LogOut, Store, User, Users, type LucideIcon } from "lucide-react";
import { uz } from "@/locale/uz";
import { logoutApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { IconBubble, Panel, Tile } from "@/components/ui/Panel";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

const MENU_ITEMS: Array<{ icon: LucideIcon; tone: "blue" | "orange" | "violet" | "green"; label: string; hint: string; to: string }> = [
  { icon: FolderOpen, tone: "blue", label: "Mening loyihalarim", hint: "Barcha xonalar va dizaynlar", to: "/projects" },
  { icon: Calculator, tone: "orange", label: "Yangi hisob-kitob", hint: "Xona o'lchamlaridan smeta", to: "/wizard" },
  { icon: Users, tone: "violet", label: "Ustalar", hint: "Tasdiqlangan ustalar", to: "/ustalar" },
  { icon: Store, tone: "green", label: "Sotuvchi paneli", hint: "Do'kon va modellaringiz", to: "/seller" },
];

const STATS = [
  { label: "Loyihalar", value: "—" },
  { label: "Xonalar", value: "—" },
  { label: "Smetalar", value: "—" },
];

export default function ProfilePage() {
  const navigate = useNavigate();
  // Cookie-based auth: assume logged in; server 401 will redirect via apiClient.
  const [loggedIn, setLoggedIn] = useState(true);
  const [deleting, setDeleting] = useState(false);

  async function handleLogout() {
    try {
      await logoutApi();
    } catch {
      // ignore errors — navigate to login regardless
    }
    // Clears the persisted user/is_admin from authStore too — logoutApi()
    // only drops the server-side cookie, so without this the sidebar's
    // admin-only "Boshqaruv paneli" link stayed visible after logging out.
    useAuthStore.getState().logout();
    setLoggedIn(false);
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-paper pb-28 lg:pb-8">
      <div className="mx-auto max-w-5xl px-5 pt-10 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-4 lg:px-6 lg:pt-6">
        {/* Who is signed in */}
        <Panel className="relative mb-4 overflow-hidden p-6 lg:mb-0">
          <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#5B84F5]/30 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <h1 className="text-sm font-semibold text-ink-muted">{uz.nav.profil}</h1>
            {loggedIn && (
              <Button variant="soft" size="sm" onClick={handleLogout} leftIcon={<LogOut size={14} aria-hidden="true" />}>
                {uz.auth.chiqish}
              </Button>
            )}
          </div>

          <div className="relative mt-6 flex items-center gap-4">
            <IconBubble className="h-16 w-16 rounded-3xl"><User size={30} aria-hidden="true" /></IconBubble>
            <div className="min-w-0">
              <p className="truncate text-xl font-extrabold text-ink">
                {loggedIn ? "Foydalanuvchi" : "Mehmon"}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {loggedIn ? "andoza.ai foydalanuvchisi" : "Kirish qilinmagan"}
              </p>
            </div>
          </div>

          <div className="relative mt-6 grid grid-cols-3 gap-2.5">
            {STATS.map((s) => (
              <Tile key={s.label} className="px-2 py-3 text-center">
                <p className="text-lg font-extrabold text-ink">{s.value}</p>
                <p className="mt-0.5 text-[11px] font-medium text-ink-muted">{s.label}</p>
              </Tile>
            ))}
          </div>

          {/* Login CTA if not logged in */}
          {!loggedIn && (
            <div className="relative mt-5 rounded-2xl bg-card-soft p-4">
              <p className="mb-3 text-sm text-ink-muted">
                Loyihalaringizni saqlash uchun telefon raqamingizni kiriting.
              </p>
              <Button className="w-full" onClick={() => navigate("/login")}>Kirish</Button>
            </div>
          )}
        </Panel>

        {/* Where to go */}
        <Panel className="p-3">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(item.to)}
                className="group flex w-full items-center gap-4 rounded-2xl p-3 text-left transition-colors hover:bg-card-soft"
              >
                <IconBubble tone={item.tone}><Icon size={22} aria-hidden="true" /></IconBubble>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-ink">{item.label}</span>
                  <span className="block text-xs text-ink-muted">{item.hint}</span>
                </span>
                <ChevronRight size={18} className="text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            );
          })}
        </Panel>

        {loggedIn && (
          <Panel className="mt-4 border border-red-500/30 p-5 lg:col-start-2">
            <h2 className="text-sm font-bold text-red-500">Hisobni o'chirish</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Hisobingiz, loyihalar, rasmlar va buyurtmalar butunlay o'chiriladi.
            </p>
            <Button variant="danger" size="sm" className="mt-3" onClick={() => setDeleting(true)}>
              Hisobni o'chirish
            </Button>
          </Panel>
        )}
      </div>

      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />

      <p className="mt-8 text-center text-xs text-on-app-muted opacity-60">andoza.ai v1.0.0</p>
    </div>
  );
}
