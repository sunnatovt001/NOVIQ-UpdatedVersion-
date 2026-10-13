import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Chrome, Eye, EyeOff, Facebook, Github, Loader2, Lock, Mail, ShieldCheck, User, X } from "lucide-react";
import { createPortal } from "react-dom";
import { getRememberAuthPreference, loginWithEmail, loginWithSocialProvider, registerWithEmail, resetPasswordWithEmail, type SocialAuthProviderId } from "@/src/lib/firebaseAuth";
import { useLocale } from "@/src/contexts/LocaleContext";
import { getAuthCopy, getAuthErrorMessage } from "./authCopy";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";

export type AuthMode = "login" | "signup";
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

export const AuthDialog = ({ mode, onClose, onModeChange }: AuthDialogProps) => {
  const { locale } = useLocale();
  const copy = getAuthCopy(locale);
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
  const title = isSignup ? copy.signupTitle : copy.loginTitle;
  const subtitle = isSignup
    ? copy.signupSubtitle
    : copy.loginSubtitle;
  const panelTitle = isSignup ? copy.signupPanelTitle : copy.loginPanelTitle;
  const panelSubtitle = isSignup
    ? copy.signupPanelSubtitle
    : copy.loginPanelSubtitle;
  const submitLabel = useMemo(() => (isSignup ? copy.create : copy.signIn), [isSignup, copy]);

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
      setErrorMessage(getAuthErrorMessage(error, locale));
      setSocialSubmittingProvider(null);
    } finally { requestRef.current = false; }
  };

  const handlePasswordReset = async () => {
    if (requestRef.current) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldErrors({ email: email.trim() ? copy.invalidEmail : copy.resetEmail });
      setErrorMessage(""); setSuccessMessage(""); emailRef.current?.focus();
      return;
    }
    setFieldErrors({}); requestRef.current = true;

    try {
      setIsResetting(true);
      setErrorMessage("");
      setSuccessMessage("");
      await resetPasswordWithEmail(email);
      setSuccessMessage(copy.resetSent);
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, locale));
    } finally {
      setIsResetting(false);
      requestRef.current = false;
    }
  };

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (requestRef.current) return;
    const errors: Record<string, string> = {};
    if (isSignup && !fullName.trim()) errors.fullName = copy.nameRequired;
    if (!email.trim()) errors.email = copy.emailRequired;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = copy.invalidEmail;
    if (!password) errors.password = copy.passwordRequired;
    else if (isSignup && password.length < 6) errors.password = copy.passwordShort;
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
      setSuccessMessage(isSignup ? copy.created : copy.signedIn);
      onClose();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, locale));
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
          aria-label={copy.close}
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
                {copy.identity}
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
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{copy.mode}</p>
                  <p className="mt-3 text-lg font-black text-white">{isSignup ? copy.newMode : copy.returnMode}</p>
                </div>
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.08] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">{copy.session}</p>
                  <p className="mt-3 text-lg font-black text-white">{rememberMe ? copy.saved : copy.privateSession}</p>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-5 shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{copy.route}</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {isSignup ? copy.signupRoute : copy.loginRoute}
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
              {copy.signIn}
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
              {copy.create}
            </button>
          </div>

          <div className="mb-7">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">
              {isSignup ? copy.newAccount : copy.returning}
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
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{copy.orEmail}</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form noValidate aria-busy={isSubmitting || isResetting || Boolean(socialSubmittingProvider)} onSubmit={handleEmailAuth} className="space-y-4">
            {isSignup && (
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-700">{copy.fullName}</span>
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
              <span className="mb-2 block text-sm font-semibold text-slate-700">{copy.email}</span>
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
              <span className="mb-2 block text-sm font-semibold text-slate-700">{copy.password}</span>
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
                  placeholder={isSignup ? copy.createPassword : copy.enterPassword}
                  className="min-h-8 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
                {fieldErrors.password && <p id="auth-password-error" role="alert" className="mt-2 text-sm text-red-700">{fieldErrors.password}</p>}
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span>
                <span className="block text-sm font-black text-slate-900">{copy.remember}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  {copy.rememberHelp}
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
                  {isResetting ? copy.sending : copy.forgot}
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
                  {copy.wait}
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
            {isSignup ? copy.existing : copy.noAccount}{" "}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? "login" : "signup")}
              className="font-black text-slate-950 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-950"
            >
              {isSignup ? copy.signIn : copy.createOne}
            </button>
          </p>
        </div>
        </motion.div>
      </div>
    </motion.div>
  , document.body);
};
