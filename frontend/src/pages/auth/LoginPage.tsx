import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { loginWithPassword, registerUser } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { uz } from "@/locale/uz";
import RegisterBackground from "./RegisterBackground";

// Inset "pressed" neumorphic field, matched to the login card surface.
const FIELD_BASE =
  "w-full rounded-xl px-4 py-3 text-sm bg-[#e9eaf0] text-neutral-800 placeholder:text-neutral-400 " +
  "shadow-[inset_3px_3px_7px_#c7c8d1,inset_-3px_-3px_7px_#ffffff] " +
  "focus:outline-none focus:shadow-[inset_4px_4px_9px_#c7c8d1,inset_-4px_-4px_9px_#ffffff] transition-shadow";

// Raised tactile button; depresses (inset) on press.
const BTN =
  "mt-6 w-full rounded-xl py-3 text-sm font-bold text-brand bg-[#e9eaf0] transition-all " +
  "shadow-[5px_5px_11px_#c7c8d1,-5px_-5px_11px_#ffffff] hover:shadow-[6px_6px_13px_#c7c8d1,-6px_-6px_13px_#ffffff] " +
  "active:shadow-[inset_4px_4px_9px_#c7c8d1,inset_-4px_-4px_9px_#ffffff] " +
  "disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none";

type AuthMode = "login" | "register";

// ── Password field with show/hide toggle ──────────────────────
function PasswordInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  autoComplete,
  autoFocus,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={`${FIELD_BASE} pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Parolni yashirish" : "Parolni ko'rsatish"}
        title={show ? "Parolni yashirish" : "Parolni ko'rsatish"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-gray-700 transition-colors"
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.47" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.1 9.1 0 0 0 5.39-1.61" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

  const from: string = (location.state as { from?: string })?.from ?? "/projects";

  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetError() { setError(null); }
  function switchMode(m: AuthMode) { setMode(m); resetError(); }

  // ── Username/password login ──────────────────────────────────
  async function handleLogin() {
    resetError();
    if (!username.trim() || !password) { setError("Username va parol majburiy."); return; }
    setLoading(true);
    try {
      const res = await loginWithPassword({ username: username.trim(), password });
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch {
      setError("Username yoki parol noto'g'ri.");
    } finally {
      setLoading(false);
    }
  }

  // ── Register ──────────────────────────────────────────────────
  async function handleRegister() {
    resetError();
    if (!username.trim()) { setError("Username majburiy."); return; }
    if (username.trim().length < 3) { setError("Username kamida 3 ta belgidan iborat bo'lishi kerak."); return; }
    if (!password) { setError("Parol majburiy."); return; }
    if (password.length < 6) { setError("Parol kamida 6 ta belgidan iborat bo'lishi kerak."); return; }
    if (password !== confirmPassword) { setError("Parollar mos kelmadi."); return; }
    setLoading(true);
    try {
      const res = await registerUser({ username: username.trim(), password, name: name.trim() || undefined });
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("409") || msg.toLowerCase().includes("band")) {
        setError("Bu username allaqachon band. Boshqa username tanlang.");
      } else {
        setError("Ro'yxatdan o'tishda xato yuz berdi.");
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-[#e6e7ee] flex flex-col items-center justify-center px-5">
      {/* Renovation scene behind the whole auth page (login + register). */}
      <RegisterBackground />

      {/* All content (brand, card, text) fades in slowly on load. */}
      <motion.div
        className="relative z-10 flex w-full flex-col items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      >
      {/* Brand */}
      <div className="mb-8 flex flex-col items-center">
        <img src="/icon.svg" alt="AndozaAI" className="w-14 h-14 mb-3" />
        <span className="text-xl font-bold tracking-tight text-neutral-800">AndozaAI</span>
      </div>

      <div className="w-full max-w-sm bg-[#e9eaf0] rounded-3xl p-8 shadow-[10px_10px_28px_#c7c8d1,-10px_-10px_28px_#ffffff]">
        {mode === "login" ? (
          <>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Kirish</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="username"
                  autoComplete="username"
                  autoFocus
                  className={FIELD_BASE}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Parol</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <button onClick={handleLogin} disabled={loading} className={BTN}>
              {loading ? uz.common.yuklanmoqda : "Kirish"}
            </button>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted">
                Akkauntingiz yo'qmi?{' '}
                <button
                  onClick={() => switchMode("register")}
                  className="text-brand font-medium hover:underline transition-colors"
                >
                  Ro'yxatdan o'tish
                </button>
              </p>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Ro'yxatdan o'tish</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Ism (ixtiyoriy)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ismingiz"
                  autoComplete="name"
                  autoFocus
                  className={FIELD_BASE}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  autoComplete="username"
                  className={FIELD_BASE}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Parol</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1.5">Parolni tasdiqlang</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

            <button onClick={handleRegister} disabled={loading} className={BTN}>
              {loading ? uz.common.yuklanmoqda : "Ro'yxatdan o'tish"}
            </button>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted">
                Allaqachon akkauntingiz bormi?{' '}
                <button
                  onClick={() => switchMode("login")}
                  className="text-brand font-medium hover:underline transition-colors"
                >
                  Kirish
                </button>
              </p>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted mt-6 text-center opacity-60">AndozaAI v1.0.0</p>
      </motion.div>
    </div>
  );
}
