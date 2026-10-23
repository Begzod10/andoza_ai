import { useAppThemeAttribute } from "@/hooks/useAppThemeAttribute";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { loginWithGoogle, loginWithPassword, registerUser } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useTranslation } from "react-i18next";
import RegisterBackground from "./RegisterBackground";
import GoogleSignInButton from "./GoogleSignInButton";
import { Button } from "@/components/ui/Button";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

// Field on the themed card: soft inset surface, brand ring on focus.
const FIELD_BASE =
  "w-full rounded-xl border border-line bg-card-soft px-4 py-3 text-sm text-ink placeholder:text-ink-muted/70 " +
  "focus:outline-none focus:ring-2 focus:ring-[#5B84F5]/70 transition-shadow";

const LABEL = "block text-xs font-semibold text-ink-muted mb-1.5";

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
  const { t } = useTranslation();
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
        aria-label={show ? t("auth.parolni_yashirish") : t("auth.parolni_korsatish")}
        title={show ? t("auth.parolni_yashirish") : t("auth.parolni_korsatish")}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
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
  const { t } = useTranslation()
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  // Login sits outside AppShell, which is what normally applies the theme.
  const theme = useThemeStore((s) => s.theme);
  useAppThemeAttribute();

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
    if (!username.trim() || !password) { setError(t("auth.xato_username_parol")); return; }
    setLoading(true);
    try {
      const res = await loginWithPassword({ username: username.trim(), password });
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch {
      setError(t("auth.xato_login"));
    } finally {
      setLoading(false);
    }
  }

  // ── Google sign-in (also signs up on first use) ──────────────
  async function handleGoogleCredential(idToken: string) {
    resetError();
    setLoading(true);
    try {
      const res = await loginWithGoogle(idToken);
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch {
      setError(t("auth.xato_google"));
    } finally {
      setLoading(false);
    }
  }

  // ── Register ──────────────────────────────────────────────────
  async function handleRegister() {
    resetError();
    if (!username.trim()) { setError(t("auth.xato_username")); return; }
    if (username.trim().length < 3) { setError(t("auth.xato_username_qisqa")); return; }
    if (!password) { setError(t("auth.xato_parol")); return; }
    if (password.length < 6) { setError(t("auth.xato_parol_qisqa")); return; }
    if (password !== confirmPassword) { setError(t("auth.xato_parollar_mos_emas")); return; }
    setLoading(true);
    try {
      const res = await registerUser({ username: username.trim(), password, name: name.trim() || undefined });
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("409") || msg.toLowerCase().includes("band")) {
        setError(t("auth.xato_username_band"));
      } else {
        setError(t("auth.xato_royxatdan_otish"));
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-paper flex flex-col items-center justify-center px-5">
      <LanguageSwitcher className="absolute right-4 top-4 z-20" />
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
        <img src="/icon.svg" alt="andoza.ai" className="w-16 h-16 mb-3 rounded-2xl shadow-glow" />
        <span className="text-xl font-extrabold tracking-tight text-ink drop-shadow-sm">andoza.ai</span>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-line bg-card/90 p-8 shadow-panel backdrop-blur-xl">
        {mode === "login" ? (
          <>
            <h2 className="text-xl font-extrabold text-ink mb-5">{t("auth.kirish")}</h2>
            <div className="space-y-4">
              <div>
                <label className={LABEL}>{t("auth.username")}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder={t("auth.username_placeholder")}
                  autoComplete="username"
                  autoFocus
                  className={FIELD_BASE}
                />
              </div>
              <div>
                <label className={LABEL}>{t("auth.parol")}</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500">{error}</p>}

            <Button size="lg" className="mt-6 w-full" onClick={handleLogin} disabled={loading}>
              {loading ? t("common.yuklanmoqda") : t("auth.kirish")}
            </Button>

            <GoogleSignInButton onCredential={handleGoogleCredential} theme={theme} />

            <div className="mt-6 text-center">
              <p className="text-sm text-ink-muted">
                {t("auth.akkaunt_yoqmi")}{' '}
                <button
                  onClick={() => switchMode("register")}
                  className="font-bold text-accent hover:underline transition-colors"
                >
                  {t("auth.royxatdan_otish")}
                </button>
              </p>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-extrabold text-ink mb-5">{t("auth.royxatdan_otish")}</h2>
            <div className="space-y-4">
              <div>
                <label className={LABEL}>{t("auth.ism_ixtiyoriy")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("auth.ismingiz")}
                  autoComplete="name"
                  autoFocus
                  className={FIELD_BASE}
                />
              </div>
              <div>
                <label className={LABEL}>{t("auth.username")}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("auth.username_placeholder")}
                  autoComplete="username"
                  className={FIELD_BASE}
                />
              </div>
              <div>
                <label className={LABEL}>{t("auth.parol")}</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className={LABEL}>{t("auth.parolni_tasdiqlang")}</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500">{error}</p>}

            <Button size="lg" className="mt-6 w-full" onClick={handleRegister} disabled={loading}>
              {loading ? t("common.yuklanmoqda") : t("auth.royxatdan_otish")}
            </Button>

            <GoogleSignInButton onCredential={handleGoogleCredential} theme={theme} />

            <div className="mt-6 text-center">
              <p className="text-sm text-ink-muted">
                {t("auth.allaqachon_akkaunt")}{' '}
                <button
                  onClick={() => switchMode("login")}
                  className="font-bold text-accent hover:underline transition-colors"
                >
                  {t("auth.kirish")}
                </button>
              </p>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-ink-muted mt-6 text-center opacity-70">andoza.ai v1.0.0</p>
      </motion.div>
    </div>
  );
}
