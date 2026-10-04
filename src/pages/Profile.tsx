import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  Award,
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
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "@/src/lib/firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";
import { getAppErrorMessage } from "@/src/lib/errors";
import { calculateLevelName } from "@/src/lib/progress";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { getNotificationPreferences, type NotificationPreferenceKey } from "@/src/lib/preferences";
import { writeDocWithQueue } from "@/src/lib/offlineSync";

const AVATAR_SIZE = 512;
const TELEGRAM_BOT_USERNAME = "noviqq_bot";

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not preview avatar."));
    reader.readAsDataURL(blob);
  });

export const Profile = () => {
  const { profile, user, updateLocalProfile } = useAuth();
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
  const [avatarPreview, setAvatarPreview] = useState("");
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  useBodyScrollLock(showAvatarModal);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarOffsetX, setAvatarOffsetX] = useState(0);
  const [avatarOffsetY, setAvatarOffsetY] = useState(0);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [telegramLinking, setTelegramLinking] = useState(false);
  const handleTelegramConnect = async () => {
    if (!user || !TELEGRAM_BOT_USERNAME || telegramLinking) return;
    setTelegramLinking(true);
    try {
      const createLink = httpsCallable<void, { token: string }>(functions, "createTelegramLink");
      const result = await createLink();
      window.location.assign(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=link_${result.data.token}`);
    } catch (error) {
      setStatus(getAppErrorMessage(error));
    } finally {
      setTelegramLinking(false);
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
    if (!user) return;
    setIsSaving(true);
    setStatus("");

    const profilePatch = {
      displayName: formData.displayName,
      currentLevel: formData.currentLevel,
      dailyTargetMinutes: formData.dailyTargetMinutes,
      showActionButtons: formData.showActionButtons,
    };

    updateLocalProfile(profilePatch);
    setEditing(false);

    try {
      if (formData.displayName !== user.displayName) {
        await updateProfile(user, { displayName: formData.displayName }).catch((error) => {
          console.warn("Firebase Auth profile update failed", error);
        });
      }
      const syncStatus = await writeDocWithQueue({ userId: user.uid, path: ["users", user.uid], kind: "update", data: profilePatch });
      setStatus(syncStatus === "synced" ? "Profile saved." : "Profile saved on this device. Cloud sync will retry when available.");
    } catch (error) {
      console.warn("Cloud profile sync failed", error);
      setStatus("Profile saved on this device. Cloud sync will resume after Firebase rules are deployed.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTelegramTest = async () => {
    if (!user) return;
    const chatId = formData.telegramId.trim();
    if (!chatId) {
      setStatus("Telegram ID kiriting.");
      return;
    }

    setTelegramTesting(true);
    setStatus("");
    try {
      const sendTelegramTestMessage = httpsCallable(functions, "sendTelegramTestMessage");
      await sendTelegramTestMessage({});
      setFormData((current) => ({ ...current, telegramId: chatId }));
      updateLocalProfile({ telegramId: chatId });
      setStatus("Telegram test xabar yuborildi.");
    } catch (error) {
      console.warn("Telegram test failed", error);
      setStatus(getAppErrorMessage(error) || "Telegram test failed. Botni start qilganingizni tekshiring.");
    } finally {
      setTelegramTesting(false);
    }
  };

  const notificationPreferences = getNotificationPreferences(profile);
  const preferenceItems: Array<{ key: NotificationPreferenceKey; icon: React.ReactNode; label: string }> = [
    { key: "studyReminders", icon: <Bell size={18} />, label: "Study reminders" },
    { key: "dailyStreakSummary", icon: <Check size={18} />, label: "Daily streak summary" },
    { key: "aiSourcePreviews", icon: <ImageIcon size={18} />, label: "AI source previews" },
  ];

  const handlePreferenceToggle = async (key: NotificationPreferenceKey) => {
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
    updateLocalProfile({ settings: nextSettings });

    try {
      await updateDoc(doc(db, "users", user.uid), { settings: nextSettings });
      setStatus(nextNotifications[key] ? "Preference enabled." : "Preference disabled.");
    } catch (error) {
      console.warn("Preference sync failed", error);
      setStatus("Preference saved on this device. Cloud sync will resume after Firebase rules are deployed.");
    } finally {
      setSavingPreference("");
    }
  };

  const handleAvatarFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setAvatarError("Avatar image must be under 8 MB.");
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
    if (!user || !avatarFile) return;
    setIsAvatarSaving(true);
    setAvatarError("");
    setStatus("");
    let savedLocally = false;

    try {
      const blob = await createCroppedAvatarBlob();
      const localPhotoURL = await blobToDataUrl(blob);

      updateLocalProfile({ photoURL: localPhotoURL });
      savedLocally = true;
      setShowAvatarModal(false);
      setAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview("");
      setStatus("Avatar saved on this device.");

      const avatarRef = ref(storage, `users/${user.uid}/avatars/avatar-${Date.now()}.jpg`);
      await uploadBytes(avatarRef, blob, { contentType: "image/jpeg" });
      const photoURL = await getDownloadURL(avatarRef);

      updateLocalProfile({ photoURL });
      await updateProfile(user, { photoURL }).catch((error) => {
        console.warn("Firebase Auth avatar update failed", error);
      });
      await updateDoc(doc(db, "users", user.uid), { photoURL });

      setStatus("Avatar updated.");
    } catch (error) {
      console.warn("Cloud avatar sync failed", error);
      if (savedLocally) {
        setAvatarError("");
        setStatus("Avatar saved on this device. Cloud sync will resume after Firebase rules are deployed.");
      } else {
        setAvatarError(getAppErrorMessage(error));
      }
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const avatarSrc =
    profile?.photoURL ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      profile?.displayName || profile?.email || "student"
    )}&hairColor=2c1b18&skinColor=f8d25c`;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-24">
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

      <header className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-10 rounded-full bg-blue-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-400">Profile</span>
          </div>
          <h2 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">Profile</h2>
          <p className="max-w-2xl text-base text-slate-400 sm:text-lg">
            Manage your account, avatar, exam preferences, and connected systems.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (editing ? handleSave() : setEditing(true))}
          disabled={isSaving}
          className={cn(
            "inline-flex min-h-14 items-center justify-center gap-3 rounded-[1.5rem] px-8 text-xs font-black uppercase tracking-widest text-white shadow-2xl transition active:scale-95 disabled:opacity-60",
            editing ? "bg-emerald-500 shadow-emerald-500/20" : "bg-blue-600 shadow-blue-600/20"
          )}
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : editing ? <Save size={18} /> : <User size={18} />}
          {editing ? "Save changes" : "Edit profile"}
        </button>
      </header>

      {status && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-200">
          {status}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        <aside className="space-y-6 lg:col-span-4">
          <section className="glass relative overflow-hidden border-white/10 bg-white/[0.02] p-8 text-center">
            <Award className="pointer-events-none absolute -right-10 -top-10 text-white/[0.04]" size={180} />

            <div className="relative mx-auto mb-8 h-44 w-44">
              <div className="h-44 w-44 overflow-hidden rounded-[3rem] border-8 border-white/5 bg-slate-900 shadow-3xl ring-1 ring-white/10">
                <img src={avatarSrc} alt="Avatar" className="h-full w-full object-cover" />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-2 right-2 flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-[#0B1020] bg-blue-600 text-white shadow-2xl transition hover:scale-105"
                aria-label="Change avatar"
              >
                <Camera size={18} />
              </button>
            </div>

            <h3 className="font-display text-3xl font-bold text-white">{profile?.displayName || "Student"}</h3>
            <p className="mt-2 text-sm text-slate-500">{profile?.email}</p>
            <div className="mt-6 flex items-center justify-center gap-4">
              {formData.showActionButtons && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                >
                  <Upload size={16} />
                  Change avatar
                </button>
              )}

              <button
                type="button"
                onClick={() => setFormData({ ...formData, showActionButtons: !formData.showActionButtons })}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10"
              >
                {formData.showActionButtons ? "Hide buttons" : "Show buttons"}
              </button>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xl font-black text-white">{profile?.level || 1}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{levelName}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xl font-black text-white">{profile?.xp || 0}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">XP</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xl font-black text-orange-300">{profile?.streak || 0}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Streak</p>
              </div>
            </div>
          </section>

          <section className="glass border-white/10 bg-white/[0.02] p-6">
            <h4 className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              <Smartphone className="text-blue-400" size={14} />
              Linked systems
            </h4>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="block text-sm font-bold text-white">Telegram Connect</span>
                  <span className="text-[10px] font-bold uppercase text-emerald-400">
                    {formData.telegramId ? "Configured" : "Not connected"}
                  </span>
                </div>
                <div className={cn("h-2 w-2 rounded-full", formData.telegramId ? "bg-emerald-400" : "bg-slate-600")} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                Botni ochib Start bosing. Noviq Telegram ID ni avtomatik profilga ulaydi, keyin daily mission summary shu chatga boradi.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {TELEGRAM_BOT_USERNAME && (
                  <button
                    type="button"
                    onClick={handleTelegramConnect}
                    disabled={telegramLinking}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-blue-500/15 px-4 text-[10px] font-black uppercase tracking-[0.18em] text-blue-200 transition hover:bg-blue-500/20 hover:text-white"
                  >
                    <ExternalLink size={14} />
                    {telegramLinking ? "Preparing link..." : "Connect bot"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleTelegramTest}
                  disabled={!formData.telegramId.trim() || telegramTesting}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-500/15 px-4 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {telegramTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send test
                </button>
              </div>
            </div>
          </section>
        </aside>

        <main className="space-y-6 lg:col-span-8">
          <section className="glass border-white/10 bg-white/[0.02] p-6 sm:p-8">
            <h4 className="mb-8 flex items-center gap-4 text-2xl font-bold text-white">
              <div className="h-8 w-2 rounded-full bg-blue-600" />
              Account details
            </h4>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Full name</span>
                <div className="relative">
                  <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    disabled={!editing}
                    value={formData.displayName}
                    onChange={(event) => setFormData({ ...formData, displayName: event.target.value })}
                    className="w-full rounded-[1.5rem] border-2 border-white/5 bg-white/[0.03] py-4 pl-14 pr-5 text-base font-bold text-white outline-none transition focus:border-blue-500/50 disabled:opacity-50"
                  />
                </div>
              </label>

              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Email</span>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    disabled
                    value={profile?.email || ""}
                    className="w-full cursor-not-allowed rounded-[1.5rem] border-2 border-white/5 bg-white/[0.03] py-4 pl-14 pr-5 text-base font-bold text-slate-400 outline-none opacity-60"
                  />
                </div>
              </label>

              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Academic status</span>
                <select
                  disabled={!editing}
                  value={formData.currentLevel}
                  onChange={(event) => setFormData({ ...formData, currentLevel: event.target.value })}
                  className="w-full rounded-[1.5rem] border-2 border-white/5 bg-white/[0.03] px-5 py-4 text-base font-bold text-white outline-none transition focus:border-blue-500/50 disabled:opacity-50"
                >
                  <option>Beginner</option>
                  <option>High School</option>
                  <option>University Student</option>
                  <option>IELTS Student</option>
                  <option>DTM Preparer</option>
                  <option>Independent Student</option>
                </select>
              </label>

              <label className="space-y-3">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Daily target</span>
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
                    className="w-full rounded-[1.5rem] border-2 border-white/5 bg-white/[0.03] py-4 pl-14 pr-5 text-base font-bold text-white outline-none transition focus:border-blue-500/50 disabled:opacity-50"
                  />
                </div>
              </label>

              <label className="space-y-3 md:col-span-2">
                <span className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Telegram ID</span>
                <div className="relative">
                  <Shield className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                  <input
                    disabled={!editing}
                    placeholder="123456789"
                    value={formData.telegramId}
                    readOnly
                    className="w-full rounded-[1.5rem] border-2 border-white/5 bg-white/[0.03] py-4 pl-14 pr-5 text-base font-bold text-white outline-none transition focus:border-blue-500/50 disabled:opacity-50"
                  />
                </div>
                <p className="ml-1 text-xs leading-5 text-slate-500">
                  Telegram hisobingizni Connect bot tugmasi orqali ulang. Chat ID tasdiqlangan ulanishdan keyin avtomatik to‘ladi.
                </p>
              </label>
            </div>
          </section>

          <section className="glass border-white/10 bg-white/[0.02] p-6 sm:p-8">
            <h4 className="mb-6 flex items-center gap-4 text-2xl font-bold text-white">
              <div className="h-8 w-2 rounded-full bg-purple-600" />
              Preferences
            </h4>
            <div className="grid gap-4">
              {preferenceItems.map((item) => {
                const active = notificationPreferences[item.key];
                const isSavingPreference = savingPreference === item.key;

                return (
                <div key={item.key} className="flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-white/5 p-3 text-blue-300">{item.icon}</div>
                    <p className="font-bold text-white">{item.label}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    aria-label={`${item.label} ${active ? "enabled" : "disabled"}`}
                    onClick={() => handlePreferenceToggle(item.key)}
                    disabled={Boolean(savingPreference)}
                    className={cn(
                      "relative h-8 w-14 shrink-0 rounded-full p-1 transition active:scale-95 disabled:cursor-wait disabled:opacity-70",
                      active ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "bg-slate-700/80"
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
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="noviq-modal-panel CustomScrollbar glass border-white/10 bg-[#0B1020] p-5 sm:p-8"
            >
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="section-label">Avatar crop</p>
                  <h3 className="text-3xl font-bold text-white">Preview avatar</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAvatarModal(false)}
                  aria-label="Close avatar editor"
                  className="rounded-xl bg-white/5 p-2 text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mx-auto h-[min(18rem,68vw)] w-[min(18rem,68vw)] overflow-hidden rounded-[3rem] border-8 border-white/10 bg-slate-950">
                {avatarPreview && (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                    style={{
                      transform: `scale(${avatarZoom}) translate(${avatarOffsetX / 3}%, ${avatarOffsetY / 3}%)`,
                    }}
                  />
                )}
              </div>

              <div className="mt-6 grid gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Zoom</span>
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
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Horizontal</span>
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
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Vertical</span>
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
              </div>

              {avatarError && (
                <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200">
                  {avatarError}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-3 font-bold text-slate-200 hover:bg-white/10"
                >
                  Choose another
                </button>
                <button
                  type="button"
                  onClick={handleSaveAvatar}
                  disabled={isAvatarSaving}
                  className="premium-action flex min-h-12 flex-1 items-center justify-center gap-2"
                >
                  {isAvatarSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Save avatar
                </button>
              </div>
            </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
