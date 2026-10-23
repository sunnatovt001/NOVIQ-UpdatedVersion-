import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  Award,
  ArrowRight,
  Crown,
  Sun,
  Moon,
  Bell,
  Camera,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Mail,
  Save,
  Send,
  Shield,
  Smartphone,
  Target,
  Upload,
  User,
  X,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "@/src/lib/callable";
import { db, functions } from "@/src/lib/firebase";
import { getAuth, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { getAppErrorMessage } from "@/src/lib/errors";
import { calculateLevelName } from "@/src/lib/progress";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { getNotificationPreferences, type NotificationPreferenceKey } from "@/src/lib/preferences";
import { writeDocWithQueue } from "@/src/lib/offlineSync";
import { isReadOnlyAudit } from "@/src/lib/auditMode";
import { useLocale } from "@/src/contexts/LocaleContext";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { getProfileCopy } from "@/src/features/profile/profileCopy";
import { avatarOptions, getProfileAvatar } from '@/src/lib/profileAvatar';
import { useMembership } from '@/src/features/pro/MembershipContext';
import '@/src/features/profile/glass-profile.css';

const AVATAR_SIZE = 512;
const TELEGRAM_BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "noviqq_bot").trim().replace(/^@/, "");

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not preview avatar."));
    reader.readAsDataURL(blob);
  });

export const Profile = () => {
  const { profile, user, updateLocalProfile } = useAuth();
  const { access, cinematic } = useMembership();
  const premiumAvatars = access.entitled;
  const { locale, setLocale } = useLocale();
  const [profileTab, setProfileTab] = useState<'details'|'preferences'|'security'>('details');
  const [resetSending, setResetSending] = useState(false);
  const [darkAppearance, setDarkAppearance] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => { const observer=new MutationObserver(()=>setDarkAppearance(document.documentElement.classList.contains('dark')));observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});return ()=>observer.disconnect(); }, []);
  const ui = locale === 'uz' ? { title:'Sizning profilingiz', subtitle:'O‘qish maydoningizni o‘zingizga moslang.', details:'Shaxsiy ma’lumotlar', preferences:'Sozlamalar', security:'Xavfsizlik', hint:'Hisob ma’lumotlaringizni yangilab boring.', avatars:'O‘zingizga mos ko‘rinishni tanlang.', upload:'Rasm yuklash', plan:'Rejani boshqarish', language:'Til', appearance:'Ko‘rinish', light:'Yorug‘', dark:'Qorong‘i', securityHint:'Kirish hisobingiz va parol sozlamalari.', reset:'Parolni tiklash xatini yuborish', sent:'Parolni tiklash xati yuborildi. Emailingizni tekshiring.', provider:'Kirish usuli', username:'Foydalanuvchi nomi', notifications:'Bildirishnomalar', savingHint:'O‘zgarishlar server tasdiqlagandan so‘ng saqlanadi.' } : locale === 'ru' ? {title:'Ваш профиль',subtitle:'Настройте учебное пространство под себя.',details:'Личные данные',preferences:'Настройки',security:'Безопасность',hint:'Поддерживайте данные аккаунта актуальными.',avatars:'Выберите образ по душе.',upload:'Загрузить фото',plan:'Управлять планом',language:'Язык',appearance:'Оформление',light:'Светлое',dark:'Тёмное',securityHint:'Аккаунт для входа и настройки пароля.',reset:'Отправить письмо для сброса пароля',sent:'Письмо отправлено. Проверьте почту.',provider:'Способ входа',username:'Имя пользователя',notifications:'Уведомления',savingHint:'Изменения сохраняются после подтверждения сервера.'} : {title:'Your profile',subtitle:'Make your learning space feel like you.',details:'Personal details',preferences:'Preferences',security:'Security',hint:'Keep your account information up to date.',avatars:'Choose a look that feels like you.',upload:'Upload photo',plan:'Manage plan',language:'Language',appearance:'Appearance',light:'Light',dark:'Dark',securityHint:'Your sign-in account and password settings.',reset:'Send password reset email',sent:'Password reset email sent. Check your inbox.',provider:'Sign-in method',username:'Username',notifications:'Notifications',savingHint:'Changes are saved after server confirmation.'};
  const copy = useMemo(() => getProfileCopy(locale), [locale]);
  const levelName = profile?.levelName || calculateLevelName(profile?.xp || 0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingPreference, setSavingPreference] = useState<NotificationPreferenceKey | "">("");
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [status, setStatus] = useState("");
  const [formData, setFormData] = useState({
    displayName: "",
    currentLevel: "",
    dailyTargetMinutes: 30,
    telegramId: "",
    showActionButtons: true,
  });

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [avatarPreview, setAvatarPreview] = useState("");
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  useBodyScrollLock(showAvatarModal);
  const avatarDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(showAvatarModal, avatarDialogRef, () => setShowAvatarModal(false));
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramDisconnecting, setTelegramDisconnecting] = useState(false);
  const handleTelegramConnect = async () => {
    if (isReadOnlyAudit) { setStatus(copy.auditBotDisabled); return; }
    if (!user || !TELEGRAM_BOT_USERNAME || telegramLinking) return;
    setTelegramLinking(true);
    try {
      let token = "";
      try {
        const createLink = httpsCallable<void, { token: string }>(functions, "createTelegramLink");
        const result = await createLink();
        token = result.data.token;
      } catch (error) {
        if (!import.meta.env.DEV) throw error;
        // The Vite middleware exists only in local development.
        const idToken = await user.getIdToken().catch(() => "");
        const resp = await fetch("/api/telegram/link-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        });
        if (resp.ok) {
          const data = await resp.json();
          token = data.token;
        } else throw new Error(copy.telegramFailed);
      }
      if (/^[a-f0-9]{48}$/.test(token) && /^[A-Za-z0-9_]{5,32}$/.test(TELEGRAM_BOT_USERNAME)) {
        window.location.assign(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=link_${token}`);
      } else {
        setStatus(copy.telegramFailed);
      }
    } catch (error) {
      setStatus(getAppErrorMessage(error));
    } finally {
      setTelegramLinking(false);
    }
  };

  const handleTelegramDisconnect = async () => {
    if (isReadOnlyAudit) { setStatus(copy.auditBotDisabled); return; }
    if (!user || telegramDisconnecting) return;
    setTelegramDisconnecting(true);
    setStatus("");
    try {
      try {
        const disconnect = httpsCallable<void, { ok: boolean }>(functions, "disconnectTelegram");
        await disconnect();
      } catch (error) {
        if (!import.meta.env.DEV) throw error;
        const idToken = await user.getIdToken().catch(() => "");
        const response = await fetch("/api/telegram/disconnect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        });
        if (!response.ok) throw new Error(copy.telegramFailed);
      }
      setFormData((current) => ({ ...current, telegramId: "" }));
      updateLocalProfile({ telegramId: "" });
      setStatus(copy.telegramDisconnected);
    } catch (error) {
      setStatus(getAppErrorMessage(error));
    } finally {
      setTelegramDisconnecting(false);
    }
  };

  useEffect(() => {
    if (editing) return;

    setFormData({
      displayName: profile?.displayName || "",
      currentLevel: profile?.currentLevel || "Beginner",
      dailyTargetMinutes: profile?.dailyTargetMinutes || 30,
      telegramId: profile?.telegramId || "",
      showActionButtons: profile?.showActionButtons !== false,
    });
  }, [editing, profile]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handleSave = async () => {
    if (isReadOnlyAudit) { setStatus(copy.auditSavingDisabled); return; }
    if (!user) return;
    setIsSaving(true);
    setStatus("");

    const profilePatch = {
      displayName: formData.displayName,
      currentLevel: formData.currentLevel,
      dailyTargetMinutes: formData.dailyTargetMinutes,
      showActionButtons: formData.showActionButtons,
    };

    try {
      const syncStatus = await writeDocWithQueue({ userId: user.uid, path: ["users", user.uid], kind: "update", data: profilePatch });
      updateLocalProfile(profilePatch);
      setEditing(false);
      if (formData.displayName !== user.displayName) {
        await updateProfile(user, { displayName: formData.displayName }).catch((error) => {
          console.warn("Firebase Auth profile update failed", error);
        });
      }
      setStatus(syncStatus === "synced" ? copy.profileSaved : copy.profileSavedLocal);
    } catch (error) {
      console.warn("Cloud profile sync failed", error);
      setStatus(getAppErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTelegramTest = async () => {
    if (isReadOnlyAudit) { setStatus(copy.auditTelegramDisabled); return; }
    if (!user || telegramTesting || !profile?.telegramId?.trim()) return;
    const chatId = profile.telegramId.trim();
    if (!chatId) {
      setStatus(copy.telegramRequired);
      return;
    }

    setTelegramTesting(true);
    setStatus("");
    try {
      const sendTelegramTestMessage = httpsCallable(functions, "sendTelegramTestMessage");
      await sendTelegramTestMessage({});
      setFormData((current) => ({ ...current, telegramId: chatId }));
      updateLocalProfile({ telegramId: chatId });
      setStatus(copy.telegramSent);
    } catch (error) {
      console.warn("Telegram test failed", error);
      setStatus(getAppErrorMessage(error) || copy.telegramFailed);
    } finally {
      setTelegramTesting(false);
    }
  };

  const notificationPreferences = getNotificationPreferences(profile);
  const preferenceItems: Array<{ key: NotificationPreferenceKey; icon: React.ReactNode; label: string }> = [
    { key: "studyReminders", icon: <Bell size={18} aria-hidden="true" />, label: copy.studyReminders },
    { key: "dailyStreakSummary", icon: <Check size={18} aria-hidden="true" />, label: copy.dailyStreakSummary },
    { key: "aiSourcePreviews", icon: <ImageIcon size={18} aria-hidden="true" />, label: copy.aiSourcePreviews },
  ];

  const handlePreferenceToggle = async (key: NotificationPreferenceKey) => {
    if (isReadOnlyAudit) { setStatus(copy.auditPreferencesDisabled); return; }
    if (!user || savingPreference) return;

    const nextNotifications = {
      ...notificationPreferences,
      [key]: !notificationPreferences[key],
    };
    const nextSettings = {
      ...(profile?.settings || {}),
      notifications: nextNotifications,
    };

    setSavingPreference(key);
    setStatus("");
    try {
      const syncStatus = await writeDocWithQueue({ userId: user.uid, path: ["users", user.uid], kind: "update", data: {settings: nextSettings} });
      updateLocalProfile({ settings: nextSettings });
      setStatus(syncStatus === "synced" ? (nextNotifications[key] ? copy.preferenceEnabled : copy.preferenceDisabled) : copy.preferenceSavedLocal);
    } catch (error) {
      console.warn("Preference sync failed", error);
      setStatus(getAppErrorMessage(error));
    } finally {
      setSavingPreference("");
    }
  };

  const handleAvatarFile = (file: File) => {
    setSelectedPreset('');
    if (!file.type.startsWith("image/")) {
      setAvatarError(copy.chooseImage);
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setAvatarError(copy.imageTooLarge);
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarZoom(1);
    setAvatarOffsetX(0);
    setAvatarOffsetY(0);
    setAvatarError("");
    setShowAvatarModal(true);
  };

  const createCroppedAvatarBlob = async () => {
    if (!avatarPreview) throw new Error("No avatar selected.");

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = avatarPreview;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not load image."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");

    const baseSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceSize = baseSize / avatarZoom;
    const maxX = Math.max(0, image.naturalWidth - sourceSize);
    const maxY = Math.max(0, image.naturalHeight - sourceSize);
    const sourceX = Math.min(maxX, Math.max(0, (image.naturalWidth - sourceSize) / 2 + (avatarOffsetX / 100) * maxX));
    const sourceY = Math.min(maxY, Math.max(0, (image.naturalHeight - sourceSize) / 2 + (avatarOffsetY / 100) * maxY));

    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Avatar crop failed."));
      }, "image/jpeg", 0.9);
    });
  };

  const handleSaveAvatar = async () => {
    if (isReadOnlyAudit) { setStatus(copy.auditAvatarDisabled); return; }
    if (user && selectedPreset && avatarOptions(premiumAvatars).includes(selectedPreset)) {
      setIsAvatarSaving(true);
      setAvatarError('');
      try {
        updateLocalProfile({ photoURL: selectedPreset });
        const syncStatus = await writeDocWithQueue({ userId: user.uid, path: ['users', user.uid], kind: 'update', data: { photoURL: selectedPreset } });
        setStatus(syncStatus === 'synced' ? copy.avatarUpdated : copy.avatarCloudPending);
        setShowAvatarModal(false);
      } catch (error) { setAvatarError(getAppErrorMessage(error)); }
      finally { setIsAvatarSaving(false); }
      return;
    }
    if (!user || !avatarFile) return;
    setIsAvatarSaving(true);
    setAvatarError("");
    setStatus("");
    let savedLocally = false;

    try {
      const blob = await createCroppedAvatarBlob();
      const localPhotoURL = await blobToDataUrl(blob);

      updateLocalProfile({ photoURL: localPhotoURL });
      const localSyncStatus = await writeDocWithQueue({ userId: user.uid, path: ['users', user.uid], kind: 'update', data: { photoURL: localPhotoURL } });
      savedLocally = true;
      setShowAvatarModal(false);
      setAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview("");
      setStatus(localSyncStatus === 'synced' ? copy.avatarUpdated : copy.avatarCloudPending);

    } catch (error) {
      console.warn("Cloud avatar sync failed", error);
      if (savedLocally) {
        setAvatarError("");
        setStatus(copy.avatarPreviewPending);
      } else {
        setAvatarError(getAppErrorMessage(error));
      }
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const avatarSrc = getProfileAvatar(profile, premiumAvatars);
  const openAvatarPicker = () => {
    setSelectedPreset(avatarSrc.startsWith('/avatars/') ? avatarSrc : '');
    setAvatarFile(null);
    setAvatarPreview('');
    setAvatarError('');
    setShowAvatarModal(true);
  };

  return (
    <div data-profile-tab={profileTab} className={cn(cinematic && 'pf-page', "mx-auto max-w-6xl space-y-8 pb-24 text-slate-950 dark:text-slate-50")}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleAvatarFile(file);
          event.currentTarget.value = "";
        }}
      />

      <header className="pf-heading flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-10 rounded-full bg-blue-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-700 dark:text-blue-300">{copy.title}</span>
          </div>
          <h2 className="font-display text-4xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-5xl">{cinematic ? ui.title : copy.title}</h2>
          <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
            {cinematic ? ui.subtitle : copy.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (editing ? handleSave() : setEditing(true))}
          disabled={isSaving}
          className={cn(
            "inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 text-sm font-black text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60",
          )}
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : editing ? <Save size={18} /> : <User size={18} />}
          {editing ? copy.saveChanges : copy.editProfile}
        </button>
      </header>

      {status && (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {status}
        </div>
      )}

      <div className="pf-grid grid gap-8 lg:grid-cols-12">
        <aside className="pf-aside space-y-6 lg:col-span-4">
          <section className="pf-identity relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900 sm:p-8">
            <Award className="pointer-events-none absolute -right-10 -top-10 text-slate-100 dark:text-white/[0.04]" size={180} aria-hidden="true" />

            <div className="relative mx-auto mb-8 h-44 w-44">
              <div className="h-44 w-44 overflow-hidden rounded-[3rem] border-8 border-slate-100 bg-slate-100 ring-1 ring-slate-200 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-700">
                <img src={avatarSrc} alt={profile?.displayName || copy.student} className="h-full w-full object-cover" />
              </div>
              <button
                type="button"
                onClick={openAvatarPicker}
                className="absolute bottom-2 right-2 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-white bg-blue-600 text-white transition-colors hover:bg-blue-700 dark:border-slate-900"
                aria-label={copy.changeAvatar}
              >
                <Camera size={18} />
              </button>
            </div>

            <h3 className="font-display text-3xl font-bold text-slate-950 dark:text-white">{profile?.displayName || copy.student}</h3>
            <p className="mt-2 break-all text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
            {cinematic && <span className="pf-plan-badge"><Crown size={14}/>NOVIQ PRO</span>}
            <div className="pf-legacy-actions mt-6 flex items-center justify-center gap-4">
              {formData.showActionButtons && (
                <button
                  type="button"
                  onClick={openAvatarPicker}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Upload size={16} />
                  {copy.changeAvatar}
                </button>
              )}

              <button
                type="button"
                onClick={() => setFormData({ ...formData, showActionButtons: !formData.showActionButtons })}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {formData.showActionButtons ? copy.hideButtons : copy.showButtons}
              </button>
            </div>

            {premiumAvatars && <div className="pro-profile-avatars mt-6">
              <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{locale === 'uz' ? 'Premium avatarlar' : locale === 'ru' ? 'Премиум-аватары' : 'Premium avatars'}</p>
              <div className="grid grid-cols-4 gap-3" aria-label="Premium avatars">
                {avatarOptions(true).map((src, index) => <button key={src} type="button" aria-label={`Choose premium avatar ${index + 1}`} aria-pressed={avatarSrc === src} onClick={() => { openAvatarPicker(); setSelectedPreset(src); }} className={cn('aspect-square min-h-11 overflow-hidden rounded-full border-2 p-0.5', avatarSrc === src ? 'border-blue-500' : 'border-transparent')}><img src={src} alt="" className="h-full w-full rounded-full object-cover"/></button>)}
              </div>
            </div>}
            {cinematic && <div className="pf-upload"><p>{ui.avatars}</p><button type="button" onClick={()=>fileInputRef.current?.click()}><Upload size={17}/>{ui.upload}</button><small>JPG, PNG · max 8 MB</small></div>}

            <div className="pf-legacy-metrics mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xl font-black text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">{profile?.level || 1}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{levelName}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xl font-black text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">{profile?.xp || 0}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">XP</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xl font-black text-blue-700 [font-variant-numeric:tabular-nums] dark:text-blue-300">{profile?.streak || 0}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{copy.streak}</p>
              </div>
            </div>
          </section>

          {cinematic && <section className="pf-membership"><span><Crown size={28}/></span><div><h3>NOVIQ PRO</h3><p>{ui.subtitle}</p><a href="#/pricing">{ui.plan}<ArrowRight size={16}/></a></div></section>}

          <section className="pf-connections rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              <Smartphone className="text-blue-600 dark:text-blue-300" size={14} aria-hidden="true" />
              {copy.linkedSystems}
            </h4>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="block text-sm font-bold text-slate-950 dark:text-white">{copy.telegramConnect}</span>
                  <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                    {formData.telegramId ? copy.configured : copy.notConnected}
                  </span>
                </div>
                <div className={cn("h-2 w-2 rounded-full", formData.telegramId ? "bg-emerald-400" : "bg-slate-600")} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                {copy.telegramHelp}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {formData.telegramId ? (
                  <>
                    <button
                      type="button"
                      onClick={handleTelegramDisconnect}
                      disabled={telegramDisconnecting}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-black text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                    >
                      {telegramDisconnecting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      {telegramDisconnecting ? copy.disconnectingBot : copy.disconnectBot}
                    </button>
                    <button
                      type="button"
                      onClick={handleTelegramTest}
                      disabled={!profile?.telegramId?.trim() || telegramTesting}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {telegramTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      {copy.sendTest}
                    </button>
                  </>
                ) : (
                  TELEGRAM_BOT_USERNAME && (
                    <button
                      type="button"
                      onClick={handleTelegramConnect}
                      disabled={telegramLinking}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition-colors hover:bg-blue-700"
                    >
                      <ExternalLink size={14} />
                      {telegramLinking ? copy.preparingLink : copy.connectBot}
                    </button>
                  )
                )}
              </div>
            </div>
          </section>
        </aside>

        <main className="pf-main space-y-6 lg:col-span-8">
          {cinematic && <nav className="pf-tabs" aria-label={copy.title}>{(['details','preferences','security'] as const).map(tab=><button type="button" key={tab} aria-pressed={profileTab===tab} onClick={()=>setProfileTab(tab)}>{ui[tab]}</button>)}</nav>}
          <section className="pf-details rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
            <h4 className="mb-8 flex items-center gap-4 text-2xl font-bold text-slate-950 dark:text-white">
              <div className="h-8 w-2 rounded-full bg-blue-600" />
              {cinematic ? ui.details : copy.accountDetails}
            </h4>
            {cinematic && <p className="pf-section-hint">{ui.hint}</p>}
            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{copy.fullName}</span>
                <div className="relative">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    disabled={!editing}
                    value={formData.displayName}
                    onChange={(event) => setFormData({ ...formData, displayName: event.target.value })}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-14 pr-5 text-base font-bold text-slate-950 outline-none transition-colors focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/60"
                  />
                </div>
              </label>

              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{copy.email}</span>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    disabled
                    value={profile?.email || user?.email || ""}
                    className="w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 py-4 pl-14 pr-5 text-base font-bold text-slate-500 outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
                  />
                </div>
              </label>

              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{copy.academicStatus}</span>
                <select
                  disabled={!editing}
                  value={formData.currentLevel}
                  onChange={(event) => setFormData({ ...formData, currentLevel: event.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-bold text-slate-950 outline-none transition-colors focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/60"
                >
                  <option value="Beginner">{copy.beginner}</option>
                  <option value="High School">{copy.highSchool}</option>
                  <option value="University Student">{copy.university}</option>
                  <option value="IELTS Student">{copy.ielts}</option>
                  <option value="DTM Preparer">{copy.dtm}</option>
                  <option value="Independent Student">{copy.independent}</option>
                </select>
              </label>

              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{copy.dailyTarget}</span>
                <div className="relative">
                  <Target className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    disabled={!editing}
                    type="number"
                    min={5}
                    max={480}
                    value={formData.dailyTargetMinutes}
                    onChange={(event) =>
                      setFormData({ ...formData, dailyTargetMinutes: Number(event.target.value) || 30 })
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-14 pr-5 text-base font-bold text-slate-950 outline-none transition-colors focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/60"
                  />
                </div>
              </label>

              <label className="pf-telegram-field space-y-3 md:col-span-2">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{copy.telegramId}</span>
                <div className="relative">
                  <Shield className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    disabled={!editing}
                    placeholder="123456789"
                    value={formData.telegramId}
                    readOnly
                    className="w-full rounded-2xl border border-slate-200 bg-slate-100 py-4 pl-14 pr-5 text-base font-bold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                  />
                </div>
                <p className="ml-1 text-xs leading-5 text-slate-500">
                  {copy.telegramHelp}
                </p>
              </label>
            </div>
            {cinematic && <footer className="pf-save-row"><p>{ui.savingHint}</p><button type="button" disabled={isSaving} onClick={()=>editing?void handleSave():setEditing(true)}>{isSaving?<Loader2 size={17} className="animate-spin"/>:editing?<Save size={17}/>:<User size={17}/ >}{editing?copy.saveChanges:copy.editProfile}</button></footer>}
          </section>

          {cinematic && <section className="pf-appearance"><h4>{ui.preferences}</h4><div><label>{ui.language}<select value={locale} onChange={e=>setLocale(e.target.value as typeof locale)}><option value="en">English</option><option value="uz">O‘zbekcha</option><option value="ru">Русский</option></select></label><div><span>{ui.appearance}</span><div className="pf-theme" role="group" aria-label={ui.appearance}>{[false,true].map(dark=><button key={String(dark)} type="button" aria-pressed={darkAppearance===dark} onClick={()=>window.dispatchEvent(new CustomEvent('noviq:pro-theme',{detail:dark?'dark':'light'}))}>{dark?<Moon size={17}/>:<Sun size={17}/ >}{dark?ui.dark:ui.light}</button>)}</div></div></div></section>}
          {cinematic && <section className="pf-security"><h4><Shield size={21}/>{ui.security}</h4><p>{ui.securityHint}</p><dl><div><dt>{copy.email}</dt><dd>{user?.email||profile?.email||'—'}</dd></div><div><dt>{ui.provider}</dt><dd>{user?.providerData?.map(p=>p.providerId).join(', ')||'—'}</dd></div></dl>{user?.providerData?.some(p=>p.providerId==='password')&&<button type="button" disabled={resetSending} onClick={async()=>{if(isReadOnlyAudit){setStatus(copy.auditSavingDisabled);return;}if(!user.email||resetSending)return;setResetSending(true);try{await sendPasswordResetEmail(getAuth(),user.email);setStatus(ui.sent);}catch(error){setStatus(getAppErrorMessage(error));}finally{setResetSending(false);}}}>{resetSending?<Loader2 size={17} className="animate-spin"/>:<Mail size={17}/ >}{ui.reset}</button>}</section>}
          <section className="pf-notifications rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 sm:p-8">
            <h4 className="mb-6 flex items-center gap-4 text-2xl font-bold text-slate-950 dark:text-white">
              <div className="h-8 w-2 rounded-full bg-blue-600" />
              {cinematic ? ui.notifications : copy.preferences}
            </h4>
            <div className="grid gap-4">
              {preferenceItems.map((item) => {
                const active = notificationPreferences[item.key];
                const isSavingPreference = savingPreference === item.key;

                return (
                <div key={item.key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800 sm:p-5">
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{item.icon}</div>
                    <p className="font-bold text-slate-950 dark:text-white">{item.label}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-label={`${item.label} ${active ? copy.enabled : copy.disabled}`}
                    onClick={() => handlePreferenceToggle(item.key)}
                    disabled={Boolean(savingPreference)}
                    className={cn(
                      "relative h-8 w-14 shrink-0 rounded-full p-1 transition active:scale-95 disabled:cursor-wait disabled:opacity-70",
                      active ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                    )}
                  >
                    <span
                      className={cn(
                        "block h-6 w-6 rounded-full bg-white shadow-lg transition-transform",
                        active ? "translate-x-6" : "translate-x-0"
                      )}
                    />
                    {isSavingPreference && (
                      <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-slate-900" />
                    )}
                  </button>
                </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>

      {createPortal(
        <AnimatePresence>
        {showAvatarModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-[130]"
          >
            <div className="noviq-modal-positioner noviq-modal-lg">
            <motion.div
              ref={avatarDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="avatar-editor-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar border border-slate-200 bg-white p-5 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:p-8"
            >
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="section-label">NOVIQ {premiumAvatars ? 'PRO' : 'FREE'}</p>
                  <h3 id="avatar-editor-title" className="text-3xl font-bold text-slate-950 dark:text-white">{copy.changeAvatar}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAvatarModal(false)}
                  aria-label={copy.closeAvatar}
                  className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:text-slate-950 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-6 grid grid-cols-4 gap-3" aria-label="NOVIQ avatars">
                {avatarOptions(premiumAvatars).map((src, index) => (
                  <button key={src} type="button" disabled={isAvatarSaving} aria-label={`NOVIQ ${premiumAvatars ? 'Pro' : 'Free'} avatar ${index + 1}`} aria-pressed={selectedPreset === src}
                    onClick={() => { setSelectedPreset(src); setAvatarFile(null); setAvatarPreview(''); setAvatarError(''); }}
                    className={cn('relative aspect-square overflow-hidden rounded-full border-4 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-blue-500', selectedPreset === src ? 'border-blue-500 ring-4 ring-blue-500/15' : 'border-transparent')}>
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    {selectedPreset === src && <span className="absolute bottom-0 right-0 rounded-full bg-blue-600 p-1 text-white"><Check size={16} /></span>}
                  </button>
                ))}
              </div>
              <div className="mx-auto h-[min(18rem,68vw)] w-[min(18rem,68vw)] overflow-hidden rounded-full border-8 border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                {!avatarPreview && <img src={selectedPreset || avatarSrc} alt={copy.avatarPreviewAlt} className="h-full w-full object-cover" />}
                {avatarPreview && (
                  <img
                    src={avatarPreview}
                    alt={copy.avatarPreviewAlt}
                    className="h-full w-full object-cover"
                    style={{
                      transform: `scale(${avatarZoom}) translate(${avatarOffsetX / 3}%, ${avatarOffsetY / 3}%)`,
                    }}
                  />
                )}
              </div>

              {avatarPreview && (<div className="mt-6 grid gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{copy.zoom}</span>
                  <input
                    type="range"
                    min={1}
                    max={2.5}
                    step={0.05}
                    value={avatarZoom}
                    onChange={(event) => setAvatarZoom(Number(event.target.value))}
                    className="w-full accent-blue-500"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{copy.horizontal}</span>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={avatarOffsetX}
                      onChange={(event) => setAvatarOffsetX(Number(event.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{copy.vertical}</span>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={avatarOffsetY}
                      onChange={(event) => setAvatarOffsetY(Number(event.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </label>
                </div>
              </div>)}
              {avatarError && (
                <div role="alert" className="mt-5 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200">
                  {avatarError}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-white py-3 font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {copy.chooseAnother}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAvatar}
                  disabled={isAvatarSaving || (!avatarFile && !selectedPreset)}
                  className="premium-action flex min-h-12 flex-1 items-center justify-center gap-2"
                >
                  {isAvatarSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {copy.saveAvatar}
                </button>
              </div>
            </motion.div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.querySelector(".noviq-app") || document.body,
      )}
    </div>
  );
};
