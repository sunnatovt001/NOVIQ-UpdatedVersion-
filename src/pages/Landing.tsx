import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Chrome,
  Eye,
  EyeOff,
  Facebook,
  Github,
  Layers,
  Music,
  Loader2,
  Lock,
  Mail,
  Menu,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from "lucide-react";
import {
  getRememberAuthPreference,
  loginWithEmail,
  loginWithSocialProvider,
  registerWithEmail,
  resetPasswordWithEmail,
  type SocialAuthProviderId,
} from "@/src/lib/firebase";
import { createPortal } from "react-dom";
import { useAuth } from "@/src/contexts/AuthContext";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";

type AuthMode = "login" | "signup";

const getAuthErrorMessage = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "This email already has an account. Switch to sign in.";
    case "auth/account-exists-with-different-credential":
      return "This email is already linked to another sign-in method. Try the original provider.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password is incorrect.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was closed before it finished.";
    case "auth/popup-blocked":
      return "Allow popups for this site, then try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/network-request-failed":
      return "Network connection failed. Check internet and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/operation-not-allowed":
      return "Enable this sign-in provider in Firebase Console > Authentication > Sign-in method.";
    default:
      return "Authentication failed. Please try again.";
  }
};

const LOGO_SRC = "/noviq-logo.jpeg";

interface AuthDialogProps {
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
}

const inputShellClass =
  "group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-950/[0.03] transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-950/[0.06]";

const primaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70";

const socialProviders: Array<{
  id: SocialAuthProviderId;
  label: string;
  icon: typeof Chrome;
}> = [
  { id: "google", label: "Google", icon: Chrome },
  { id: "github", label: "GitHub", icon: Github },
  { id: "facebook", label: "Facebook", icon: Facebook },
];

const examFeatureCards: Array<{
  title: string;
  copy: string;
  icon: typeof BookOpen;
  accent: string;
  iconShell: string;
  glow: string;
}> = [
  {
    title: "Exam Planning",
    copy: "Daily plans adapt to exam date, target score, weak sections, and available study hours.",
    icon: BookOpen,
    accent: "text-[#2E5EAA]",
    iconShell: "bg-[#EAF2FF]",
    glow: "bg-[#2E5EAA]/10",
  },
  {
    title: "Vocabulary Decks",
    copy: "Review IELTS vocabulary, SAT context words, HSK characters, and CEFR grammar patterns.",
    icon: Layers,
    accent: "text-[#06B6D4]",
    iconShell: "bg-[#E7FAFD]",
    glow: "bg-[#06B6D4]/12",
  },
  {
    title: "Timed Practice",
    copy: "Run focused sessions for reading, listening, writing, speaking, math, and past-paper blocks.",
    icon: Music,
    accent: "text-[#6366F1]",
    iconShell: "bg-[#EEF0FF]",
    glow: "bg-[#6366F1]/10",
  },
  {
    title: "Metrics",
    copy: "Track progress over time with study metrics, streaks, and mastery insights.",
    icon: Eye,
    accent: "text-[#10B981]",
    iconShell: "bg-[#E8F8F1]",
    glow: "bg-[#10B981]/10",
  },
  {
    title: "Exam Tutor",
    copy: "Get structured help for supported exams and academic subjects without generic AI clutter.",
    icon: Sparkles,
    accent: "text-[#8B5CF6]",
    iconShell: "bg-[#F1ECFF]",
    glow: "bg-[#8B5CF6]/10",
  },
  {
    title: "Academic Notebook",
    copy: "Organize source notes, transcripts, and past-paper reflections for exam review.",
    icon: BookOpen,
    accent: "text-[#D99000]",
    iconShell: "bg-[#FFF3DF]",
    glow: "bg-[#F59E0B]/12",
  },
];

const AuthDialog = ({ mode, onClose, onModeChange }: AuthDialogProps) => {
  useBodyScrollLock(true);
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useDialogFocus(true, dialogRef, onClose);
  useEffect(() => {
    const background = document.getElementById("root");
    if (!background) return;
    const previous = background.inert;
    background.inert = true;
    return () => { background.inert = previous; };
  }, []);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getRememberAuthPreference());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialSubmittingProvider, setSocialSubmittingProvider] = useState<SocialAuthProviderId | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isSignup = mode === "signup";
  const title = isSignup ? "Create your study account" : "Sign in to your workspace";
  const subtitle = isSignup
    ? "Start fresh with email, password, or a connected social account."
    : "Use your saved account and continue exactly where you stopped.";
  const panelTitle = isSignup ? "A focused workspace from day one." : "Your progress stays connected.";
  const panelSubtitle = isSignup
    ? "New students get a clean profile, onboarding, daily streaks, and AI exam tools after account creation."
    : "Returning students are recognized from Firebase Auth persistence and routed straight into the app.";
  const submitLabel = useMemo(() => (isSignup ? "Create account" : "Sign in"), [isSignup]);

  const switchMode = (nextMode: AuthMode) => {
    if (requestRef.current) return;
    setFieldErrors({});
    onModeChange(nextMode);
    setPassword("");
    setShowPassword(false);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSocialAuth = async (providerId: SocialAuthProviderId) => {
    if (requestRef.current) return;
    requestRef.current = true;
    try {
      setSocialSubmittingProvider(providerId);
      setErrorMessage("");
      setSuccessMessage("");
      await loginWithSocialProvider(providerId, rememberMe);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setSocialSubmittingProvider(null);
    } finally { requestRef.current = false; }
  };

  const handlePasswordReset = async () => {
    if (requestRef.current) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldErrors({ email: email.trim() ? "Enter a valid email address." : "Enter your email to reset your password." });
      setErrorMessage(""); setSuccessMessage(""); emailRef.current?.focus();
      return;
    }
    setFieldErrors({}); requestRef.current = true;

    try {
      setIsResetting(true);
      setErrorMessage("");
      setSuccessMessage("");
      await resetPasswordWithEmail(email);
      setSuccessMessage("Password reset link sent to your email.");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsResetting(false);
      requestRef.current = false;
    }
  };

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (requestRef.current) return;
    const errors: Record<string, string> = {};
    if (isSignup && !fullName.trim()) errors.fullName = "Enter your full name.";
    if (!email.trim()) errors.email = "Enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Enter your password.";
    else if (isSignup && password.length < 6) errors.password = "Use at least 6 characters.";
    setFieldErrors(errors); setErrorMessage(""); setSuccessMessage("");
    if (Object.keys(errors).length) {
      (errors.fullName ? nameRef : errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    requestRef.current = true;

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const trimmedEmail = email.trim();

      if (isSignup) {
        await registerWithEmail(fullName.trim(), trimmedEmail, password, rememberMe);
      } else {
        await loginWithEmail(trimmedEmail, password, rememberMe);
      }

      setIsSubmitting(false);
      setErrorMessage("");
      setSuccessMessage(isSignup ? "Account created." : "Signed in successfully.");
      onClose();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
      setIsSubmitting(false);
    } finally { requestRef.current = false; }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="noviq-modal-backdrop z-50"
    >
      <div className="noviq-modal-positioner noviq-modal-lg">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        tabIndex={-1}
        className="noviq-modal-panel CustomScrollbar relative grid rounded-[28px] border border-white/15 bg-white text-slate-950 shadow-[0_36px_120px_rgba(2,6,23,0.45)]"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
          aria-label="Close auth form"
        >
          <X size={18} />
        </button>

        <aside className="relative hidden min-h-[680px] overflow-hidden bg-[#0B1727] p-9 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(46,94,170,0.38),transparent_32%),radial-gradient(circle_at_84%_18%,rgba(232,198,106,0.22),transparent_28%),linear-gradient(145deg,#0B1727_0%,#10243B_54%,#07101E_100%)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
            <div className="flex items-center gap-3">
              <img
                src={LOGO_SRC}
                alt="Noviq logo"
                className="h-11 w-11 rounded-2xl border border-white/10 object-cover"
              />
              <span className="text-lg font-black tracking-tight">Noviq</span>
            </div>

            <div className="mt-14 max-w-sm">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-2 text-[11px] font-bold text-slate-200">
                <ShieldCheck size={14} className="text-cyan-300" />
                Secure academic identity
              </div>
              <h2 className="mt-6 text-4xl font-black leading-tight tracking-tight">
                {panelTitle}
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                {panelSubtitle}
              </p>
            </div>
          </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Mode</p>
                  <p className="mt-3 text-lg font-black text-white">{isSignup ? "New" : "Return"}</p>
                </div>
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">Session</p>
                  <p className="mt-3 text-lg font-black text-white">{rememberMe ? "Saved" : "Private"}</p>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Account route</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {isSignup ? "Create profile, then onboarding" : "Verify account, then dashboard"}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#14213D]">
                    {isSignup ? <User size={20} /> : <Lock size={20} />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="p-5 pt-16 sm:p-8 sm:pt-16 lg:p-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src={LOGO_SRC}
              alt="Noviq logo"
              className="h-11 w-11 rounded-2xl border border-slate-200 object-cover"
            />
            <span className="text-lg font-black tracking-tight">Noviq</span>
          </div>

          <div className="mb-8 grid grid-cols-2 rounded-full border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-full px-4 py-3 text-sm font-bold transition ${
                !isSignup
                  ? "bg-white text-slate-950 shadow-sm shadow-slate-950/[0.06]"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`rounded-full px-4 py-3 text-sm font-bold transition ${
                isSignup
                  ? "bg-white text-slate-950 shadow-sm shadow-slate-950/[0.06]"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Create account
            </button>
          </div>

          <div className="mb-7">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
              {isSignup ? "New account" : "Returning account"}
            </p>
            <h2 id="auth-dialog-title" className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">{subtitle}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {socialProviders.map((provider) => {
              const Icon = provider.icon;
              const isLoading = socialSubmittingProvider === provider.id;

              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => handleSocialAuth(provider.id)}
                  disabled={isSubmitting || isResetting || Boolean(socialSubmittingProvider)}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 shadow-sm shadow-slate-950/[0.04] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                  {provider.label}
                </button>
              );
            })}
          </div>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">or email</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form noValidate aria-busy={isSubmitting || isResetting || Boolean(socialSubmittingProvider)} onSubmit={handleEmailAuth} className="space-y-4">
            {isSignup && (
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">Full name</span>
                <div className={inputShellClass}>
                  <User size={18} className="text-slate-400 transition group-focus-within:text-slate-700" />
                  <input
                    ref={nameRef}
                    required
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={fieldErrors.fullName ? "auth-fullName-error" : undefined}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    type="text"
                    autoComplete="name"
                    placeholder="Saidamin"
                    className="min-h-8 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
                  />
                </div>
                {fieldErrors.fullName && <p id="auth-fullName-error" role="alert" className="mt-2 text-sm text-red-700">{fieldErrors.fullName}</p>}
              </label>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Email/Gmail</span>
              <div className={inputShellClass}>
                <Mail size={18} className="text-slate-400 transition group-focus-within:text-slate-700" />
                <input
                  ref={emailRef}
                    required
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
                    value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete={isSignup ? "email" : "username"}
                  placeholder="you@gmail.com"
                  className="min-h-8 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
                />
              </div>
                {fieldErrors.email && <p id="auth-email-error" role="alert" className="mt-2 text-sm text-red-700">{fieldErrors.email}</p>}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
              <div className={inputShellClass}>
                <Lock size={18} className="text-slate-400 transition group-focus-within:text-slate-700" />
                <input
                  ref={passwordRef}
                    required
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "auth-password-error" : undefined}
                    value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  placeholder={isSignup ? "Create a password" : "Enter your password"}
                  className="min-h-8 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
                {fieldErrors.password && <p id="auth-password-error" role="alert" className="mt-2 text-sm text-red-700">{fieldErrors.password}</p>}
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span>
                <span className="block text-sm font-black text-slate-900">Remember this device</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  Keep me signed in next time.
                </span>
              </span>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-5 w-5 shrink-0 accent-slate-950"
              />
            </label>

            {!isSignup && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={isResetting || isSubmitting || Boolean(socialSubmittingProvider)}
                  className="text-sm font-bold text-slate-600 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResetting ? "Sending..." : "Forgot password?"}
                </button>
              </div>
            )}

            {errorMessage && (
              <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {successMessage}
              </div>
            )}

            <button type="submit" disabled={isSubmitting || isResetting || Boolean(socialSubmittingProvider)} className={primaryButtonClass}>
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Please wait
                </>
              ) : (
                <>
                  {submitLabel}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? "login" : "signup")}
              className="font-black text-slate-950 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-950"
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
        </motion.div>
      </div>
    </motion.div>
  , document.body);
};

export const Landing = () => {
  const { user } = useAuth();
  const startExamPrep = () => {
    window.location.hash = "/planner";
    if (!user) openAuth("signup");
  };
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#FAFAF8] text-[#14213D] selection:bg-[#DDB967]/30">
      <div className="landing-backdrop pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="landing-backdrop-grid absolute inset-0" />
        <div className="absolute -right-[12rem] -top-[8rem] h-[34rem] w-[34rem] rounded-full bg-[#C9D8FF]/55" />
        <div className="absolute -bottom-[16rem] left-[18%] h-[34rem] w-[34rem] rounded-full bg-[#F4D7A6]/45" />
        <div className="absolute left-[7%] top-[18%] h-24 w-24 rounded-[2rem] border border-[#B8C7E8]/70 bg-white/55" />
      </div>

      <header className="relative z-30 px-4 py-4 sm:px-6">
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between rounded-3xl border border-[#D8DEE7] bg-white/90 px-4 py-3 shadow-[0_18px_55px_rgba(20,33,61,0.08)] backdrop-blur-2xl sm:px-5">
          <div className="flex items-center gap-3">
            <img
              src={LOGO_SRC}
              alt="Noviq logo"
              className="h-11 w-11 rounded-2xl border border-[#D8DEE7] object-cover shadow-xl shadow-[#14213D]/10"
            />
            <span className="text-lg font-black tracking-tight text-[#14213D]">Noviq</span>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#D8DEE7] bg-white px-5 text-sm font-bold text-[#34435E] transition hover:-translate-y-0.5 hover:border-[#14213D]/30 hover:bg-[#F3F7F6] hover:text-[#14213D] active:translate-y-0"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#14213D] px-5 text-sm font-black text-white shadow-lg shadow-[#14213D]/15 transition hover:-translate-y-0.5 hover:bg-[#1F2F52] active:translate-y-0"
            >
              Sign up
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D8DEE7] bg-white text-[#14213D] transition hover:bg-[#F3F7F6] md:hidden"
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="absolute left-0 right-0 top-[calc(100%+0.75rem)] overflow-hidden rounded-3xl border border-[#D8DEE7] bg-white p-3 shadow-2xl shadow-[#14213D]/15 backdrop-blur-2xl md:hidden"
              >
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => openAuth("login")}
                    className="flex min-h-12 items-center justify-center rounded-2xl border border-[#D8DEE7] bg-white px-5 text-sm font-bold text-[#34435E] transition hover:bg-[#F3F7F6] hover:text-[#14213D]"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth("signup")}
                    className="flex min-h-12 items-center justify-center rounded-2xl bg-[#14213D] px-5 text-sm font-black text-white shadow-lg shadow-[#14213D]/15 transition hover:bg-[#1F2F52]"
                  >
                    Sign up
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
      </header>

      <main className="relative z-20 flex min-h-[calc(100vh-92px)] items-center justify-center px-6 pb-24 pt-8">
        <div className="grid w-full max-w-7xl items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[#52627A] shadow-[0_16px_45px_rgba(20,33,61,0.08)] backdrop-blur-2xl">
              <Sparkles className="text-[#B48A37]" size={14} />
              Exam preparation, organized
            </div>
            <div className="max-w-3xl space-y-6">
              <h1 id="auth-dialog-title" className="text-5xl font-black leading-[0.95] tracking-normal text-[#14213D] drop-shadow-[0_1px_0_rgba(255,255,255,0.72)] md:text-[5rem] xl:text-[5.5rem]">
                AI Study Operating System for exam preparation and academic success.
              </h1>
              <div className="max-w-2xl space-y-4">
                <p className="rounded-[2rem] border border-white/70 bg-white/[0.72] px-5 py-4 text-lg font-medium leading-8 text-[#34435E] shadow-[0_22px_70px_rgba(20,33,61,0.1)] backdrop-blur-2xl">
                  Plan, practice, and improve for IELTS, SAT, HSK, CEFR, school subjects, and university entrance exams with focused AI guidance.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["IELTS", "SAT", "HSK", "CEFR", "School", "Entrance"].map((track) => (
                    <span
                      key={track}
                      className="rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#34435E] shadow-sm backdrop-blur-xl"
                    >
                      {track}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="inline-flex items-center justify-center rounded-[2rem] bg-gradient-to-r from-[#E8C66A] to-[#B48A37] px-10 py-4 text-sm font-black uppercase tracking-[0.2em] text-[#14213D] shadow-2xl shadow-[#B48A37]/25 transition-transform hover:-translate-y-0.5 active:scale-95"
              >
                Sign up free
              </button>
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="inline-flex items-center justify-center rounded-[2rem] border border-[#D8DEE7] bg-white px-10 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#14213D] shadow-sm transition hover:bg-[#F3F7F6]"
              >
                Sign in
              </button>
            </div>
            <div className="grid gap-3 pt-4 sm:grid-cols-3">
              <div className="rounded-[2rem] border border-white/70 bg-white/[0.68] p-4 shadow-[0_18px_55px_rgba(20,33,61,0.09)] backdrop-blur-2xl">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#14213D] text-white shadow-lg shadow-[#14213D]/15">
                  <BookOpen size={19} />
                </div>
                <p className="text-3xl font-black text-[#14213D]">6</p>
                <p className="mt-2 text-sm font-semibold leading-5 text-[#52627A]">Exam tracks mapped into focused study lanes.</p>
              </div>
              <div className="rounded-[2rem] border border-white/70 bg-white/[0.68] p-4 shadow-[0_18px_55px_rgba(20,33,61,0.09)] backdrop-blur-2xl">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E8C66A] text-[#14213D] shadow-lg shadow-[#B48A37]/20">
                  <Layers size={19} />
                </div>
                <p className="text-3xl font-black text-[#14213D]">Daily</p>
                <p className="mt-2 text-sm font-semibold leading-5 text-[#52627A]">Weak spots turn into repeatable drills.</p>
              </div>
              <div className="rounded-[2rem] border border-white/70 bg-white/[0.68] p-4 shadow-[0_18px_55px_rgba(20,33,61,0.09)] backdrop-blur-2xl">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2E5EAA] text-white shadow-lg shadow-[#2E5EAA]/20">
                  <Sparkles size={19} />
                </div>
                <p className="text-3xl font-black text-[#14213D]">24/7</p>
                <p className="mt-2 text-sm font-semibold leading-5 text-[#52627A]">Exam tutor stays ready between sessions.</p>
              </div>
            </div>
          </div>

          <div className="scene-3d relative mx-auto max-w-[420px]">
            <motion.div
              whileHover={{ rotateY: 8, rotateX: -4, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 85, damping: 18 }}
              className="relative z-10 overflow-hidden rounded-[3rem] border border-white/10 bg-slate-950/95 shadow-3xl"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.2),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(248,196,70,0.16),transparent_35%)] opacity-90" />
              <div className="relative z-10 flex flex-col overflow-hidden">
                <div className="relative h-56 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-8 pb-6 pt-8">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.35em] text-slate-500">ACADEMY PRO</span>
                    <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-amber-200">
                      Elite
                    </div>
                  </div>
                  <div className="mt-8 flex items-center gap-5">
                    <div className="flex h-20 w-20 items-center justify-center rounded-[2.5rem] border border-white/10 bg-slate-900/65 shadow-lg shadow-blue-500/10">
                      <BookOpen className="text-amber-300" size={32} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Exam suite</p>
                      <p className="text-2xl font-black text-white">Academic Progress</p>
                    </div>
                  </div>
                  <div className="absolute right-6 top-14 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.35em] text-slate-300">
                    Focus mode
                  </div>
                </div>

                <div className="relative -mt-8 rounded-[2.5rem] bg-white p-7 shadow-[0_30px_80px_rgba(15,23,42,0.15)]">
                  <div className="space-y-4">
                    <div className="rounded-[2rem] border border-slate-200/30 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3 text-slate-700">
                        <span className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Noviq Tutor Mode</span>
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-900">24/7 Active</span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-700">
                        Generate focused drills for IELTS, SAT, HSK, CEFR, school subjects, and university entrance exams.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.8rem] bg-slate-950/85 p-4 text-white shadow-lg shadow-slate-950/10">
                        <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Exam Tracks</p>
                        <p className="mt-3 text-2xl font-black">6</p>
                      </div>
                      <div className="rounded-[1.8rem] bg-slate-950/85 p-4 text-white shadow-lg shadow-slate-950/10">
                        <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Weakness Loop</p>
                        <p className="mt-3 text-2xl font-black">Daily</p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={startExamPrep}
                    className="mt-8 w-full rounded-[2rem] bg-gradient-to-r from-amber-400 to-amber-600 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-slate-950 shadow-xl shadow-amber-500/30 transition hover:-translate-y-0.5 active:scale-95"
                  >
                    Start Exam Prep
                  </button>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </main>

      <section className="relative z-20 overflow-hidden border-y border-white/70 bg-white/[0.74] px-6 py-24 shadow-[0_-20px_80px_rgba(20,33,61,0.08)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_4%,rgba(46,94,170,0.1),transparent_30%),radial-gradient(circle_at_84%_12%,rgba(232,198,106,0.18),transparent_26%)]" />

        <div className="relative mx-auto max-w-7xl">
          <div className="mb-16 text-center">
            <p className="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-[#2E5EAA]">
              Academic command center
            </p>
            <h2 className="text-4xl font-black leading-[1.05] tracking-normal text-[#14213D] md:text-5xl">
              Built for Exam Preparation
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg font-medium leading-8 text-[#52627A]">
              A focused academic workspace for IELTS, SAT, HSK, CEFR, school subjects, and university entrance exams.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {examFeatureCards.map((feature) => {
              const Icon = feature.icon;

              return (
                <motion.article
                  key={feature.title}
                  whileHover={{ y: -6, scale: 1.01 }}
                  transition={{ type: "spring", stiffness: 150, damping: 18 }}
                  className="group relative min-h-[336px] overflow-hidden rounded-[2.6rem] border border-[#D8DEE7]/90 bg-white/[0.88] px-8 py-10 text-center shadow-[0_24px_80px_rgba(20,33,61,0.09)] backdrop-blur-2xl"
                >
                  <div className={`absolute left-1/2 top-8 h-28 w-28 -translate-x-1/2 rounded-full blur-2xl transition group-hover:scale-125 ${feature.glow}`} />
                  <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
                  <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] border border-white/80 bg-white shadow-[0_18px_45px_rgba(20,33,61,0.08)]">
                    <div className={`absolute inset-2 rounded-[1.5rem] ${feature.iconShell}`} />
                    <Icon className={`relative ${feature.accent}`} size={31} />
                  </div>

                  <h3 className="relative mt-9 text-2xl font-black tracking-normal text-[#14213D]">{feature.title}</h3>
                  <p className="relative mx-auto mt-5 max-w-sm text-base font-medium leading-8 text-[#52627A]">{feature.copy}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="relative z-20 border-t border-[#D8DEE7] py-10 text-center text-sm text-[#52627A]">
        Copyright 2026 Noviq AI. Crafted for modern students.
      </footer>

      <AnimatePresence>
        {authMode && (
          <AuthDialog
            mode={authMode}
            onClose={() => setAuthMode(null)}
            onModeChange={setAuthMode}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
