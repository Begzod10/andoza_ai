import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { requestOTP, verifyOTP, loginWithPassword, registerUser } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { uz } from "@/locale/uz";

type AuthMode = "login" | "register" | "otp-phone" | "otp-code";

const RESEND_COOLDOWN = 60;

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
        className="w-full border border-neutral-200 rounded-lg px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
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

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998")) return `+${digits}`;
  if (digits.startsWith("0")) return `+998${digits.slice(1)}`;
  return `+998${digits}`;
}

function isValidPhone(phone: string): boolean {
  return /^\+998\d{9}$/.test(phone);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);

  const from: string = (location.state as { from?: string })?.from ?? "/projects";

  const [mode, setMode] = useState<AuthMode>("otp-phone");

  // Username/password fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // OTP fields
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [cooldown, setCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function resetError() { setError(null); }

  function switchMode(m: AuthMode) {
    setMode(m);
    resetError();
  }

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

  // ── OTP ──────────────────────────────────────────────────────
  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleRequestOTP() {
    resetError();
    const normalized = formatPhone(phone);
    if (!isValidPhone(normalized)) { setError(uz.errors.telefon_format); return; }
    setLoading(true);
    try {
      await requestOTP(normalized);
      setPhone(normalized);
      setMode("otp-code");
      startCooldown();
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError(uz.errors.server_xato);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTPWithCode(code: string) {
    resetError();
    setLoading(true);
    try {
      const res = await verifyOTP(phone, code);
      setAuthenticated(res.user);
      navigate(from, { replace: true });
    } catch {
      setError(uz.errors.otp_xato);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    const code = otp.join("");
    if (code.length < 6) { setError(uz.errors.otp_xato); return; }
    await handleVerifyOTPWithCode(code);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    resetError();
    setLoading(true);
    try {
      await requestOTP(phone);
      setOtp(["", "", "", "", "", ""]);
      startCooldown();
      otpRefs.current[0]?.focus();
    } catch {
      setError(uz.errors.server_xato);
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (next.every((d) => d !== "") && digit) {
      const code = next.join("");
      if (code.length === 6) setTimeout(() => handleVerifyOTPWithCode(code), 50);
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-5">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="text-5xl font-bold text-neutral-900 mb-2">👋 Salom</div>
        <p className="text-lg text-muted">UyTa'mir-ga xush kelibsiz</p>
      </div>

      <div className="w-full max-w-sm bg-surface rounded-2xl shadow-card p-8">
        {/* ── OTP code step ── */}
        {mode === "otp-code" ? (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">✓ Kod yuborildi</h2>
            <p className="text-sm text-muted mb-6">
              <span className="font-medium text-gray-900">{phone}</span> raqamiga 6 xonali kod yuboramiz
            </p>
            <div className="flex gap-2 justify-center mb-5">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-lg font-bold border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
                />
              ))}
            </div>
            {error && <p className="text-xs text-red-500 text-center mb-3">{error}</p>}
            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.some((d) => !d)}
              className="w-full bg-brand text-white rounded-lg py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? uz.common.yuklanmoqda : uz.auth.otp_tasdiqlash}
            </button>
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              className="mt-3 w-full text-sm text-muted hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cooldown > 0 ? `${uz.auth.qayta_yuborish} (${cooldown}s)` : uz.auth.qayta_yuborish}
            </button>
          </>
        ) : (
          <>
            {/* ── Login tab ── */}
            {mode === "login" && (
              <>
                <button
                  onClick={() => switchMode("otp-phone")}
                  className="flex items-center gap-1.5 text-sm text-muted hover:text-neutral-900 transition-colors mb-6"
                >
                  ← {uz.auth.orqaga}
                </button>
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
                      className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
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

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="mt-6 w-full bg-brand text-white rounded-lg py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
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
            )}

            {/* ── Register tab ── */}
            {mode === "register" && (
              <>
                <button
                  onClick={() => switchMode("otp-phone")}
                  className="flex items-center gap-1.5 text-sm text-muted hover:text-neutral-900 transition-colors mb-6"
                >
                  ← {uz.auth.orqaga}
                </button>
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
                      className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
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
                      className="w-full border border-neutral-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors"
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

                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="mt-6 w-full bg-brand text-white rounded-lg py-3 text-sm font-semibold hover:bg-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
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

            {/* ── OTP phone step ── */}
            {mode === "otp-phone" && (
              <>
                <h2 className="text-lg font-semibold text-neutral-900 mb-1">Telefon raqam</h2>
                <p className="text-sm text-muted mb-6">Loginiga uchun telefon raqam talab qilinadi</p>

                <div className="mb-6">
                  <label className="block text-xs font-medium text-neutral-600 mb-2">Telefon raqam</label>
                  <div className="flex items-center border-2 border-brand rounded-lg px-4 py-3 bg-primary-tint focus-within:ring-2 focus-within:ring-brand/40">
                    <span className="text-neutral-600 font-medium">+998</span>
                    <input
                      type="tel"
                      value={phone.replace(/\+998/, '')}
                      onChange={(e) => setPhone(`+998${e.target.value.replace(/[^\d]/g, '')}`)}
                      onKeyDown={(e) => e.key === "Enter" && handleRequestOTP()}
                      placeholder="90 123 45 67"
                      autoFocus
                      autoComplete="tel"
                      disabled={loading}
                      className="flex-1 ml-2 bg-transparent text-neutral-900 font-medium text-base placeholder-neutral-400 focus:outline-none"
                    />
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">Sms kod shu raqamga yuboriladi</p>
                </div>

                {error && <p className="text-xs text-red-500 mb-4 text-center">{error}</p>}

                <button
                  onClick={handleRequestOTP}
                  disabled={loading || !phone}
                  className={`w-full rounded-lg py-4 font-bold text-white transition-colors ${
                    loading || !phone ? 'bg-neutral-300 cursor-not-allowed' : 'bg-brand hover:bg-brand/90'
                  }`}
                >
                  {loading ? uz.common.yuklanmoqda : "OTP Yuborish"}
                </button>

                <div className="mt-8 bg-primary-tint p-4 rounded-lg">
                  <p className="text-sm text-neutral-700">
                    📱 Siz kiritgan raqamga 6 xonali kod yuboriladi. Agar SMS kelmaydigan bo'lsa, 2-3 minutdan keyin qayta urinib ko'ring.
                  </p>
                </div>

                {/* Option to use username/password */}
                <div className="flex items-center gap-3 mt-8">
                  <div className="flex-1 h-px bg-neutral-200" />
                  <span className="text-xs text-muted">yoki</span>
                  <div className="flex-1 h-px bg-neutral-200" />
                </div>
                <button
                  onClick={() => switchMode("login")}
                  className="w-full mt-4 border border-neutral-200 text-neutral-700 rounded-lg py-3 text-sm font-medium hover:bg-neutral-50 transition-colors"
                >
                  🔐 Username bilan kirish
                </button>
              </>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-muted mt-6 text-center opacity-60">AndozaAI v1.0.0</p>
    </div>
  );
}
