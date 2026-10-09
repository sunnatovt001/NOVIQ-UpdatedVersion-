import {
  loadLocalData,
  trySaveLocalData as saveLocalData,
} from "@/src/lib/localStore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  CircleUserRound,
  Compass,
  GraduationCap,
  MessageCircle,
  Plus,
  Search,
  Send,
  Sparkles,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { sendEmailVerification } from "firebase/auth";
import { db, functions } from "@/src/lib/firebase";
import { useAuth } from "@/src/contexts/AuthContext";
import { recordDate } from "@/src/lib/recordDate";
import { isReadOnlyAudit } from "@/src/lib/auditMode";
import { messageAuthor, resolveMessageAuthor } from "@/src/lib/activityEvidence";
import { useLocale } from "@/src/contexts/LocaleContext";
import { formatCommunityCopy, getCommunityCopy } from "@/src/features/community/communityCopy";
import { CommunityMembersDialog, type CommunityDirectory } from "@/src/features/community/CommunityMembersDialog";

type Room = {
  id: string;
  name: string;
  description?: string;
  membersCount?: number;
  role?: string;
};
type Invite = {
  id: string;
  email: string;
  status: string;
  token?: string;
  expiresAt?: string;
};
type Message = {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt?: unknown;
};
const call = async <T,>(
  name: string,
  data: Record<string, unknown>,
): Promise<T> => {
  if (isReadOnlyAudit && !["getCommunityMemberCount", "getCommunityMembers", "getFriendInvite"].includes(name)) throw new Error("Group writes and invitations are disabled in read-only audit mode.");
  return (await httpsCallable<Record<string, unknown>, T>(functions, name, { timeout: 20000 })(data)).data;
};
const errorText = (error: unknown, fallback: string) =>
  error instanceof Error
    ? error.message
    : fallback;
const button =
  "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";
const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-500/20";
const panel = "rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const selectableGroups = (groups: Room[]) => {
  const lastSat = groups.reduce((last, group, index) => group.name.trim().toLowerCase() === "sat" ? index : last, -1);
  return groups.filter((group, index) => group.name.trim().toLowerCase() !== "sat" || index === lastSat);
};
export const Community = () => {
  const { user } = useAuth();
  const { locale } = useLocale();
  const copy = getCommunityCopy(locale);
  const [rooms, setRooms] = useState<Room[]>([]),
    [joined, setJoined] = useState<Room[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]),
    [friends, setFriends] = useState<Room[]>([]);
  const [active, setActive] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [directory, setDirectory] = useState<CommunityDirectory | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const directoryRequest = useRef(false);
  const directoryVersion = useRef(0);
  const [groupDetails, setGroupDetails] = useState<Record<string, { count?: number; state: "loading" | "ready" | "missing" | "error" }>>({});
  const [authorLabels, setAuthorLabels] = useState<Record<string, Record<string, string | null>>>({});
  const [authorLookupState, setAuthorLookupState] = useState<Record<string, "loading" | "ready" | "error">>({});
  const [groupRevision, setGroupRevision] = useState(0);
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [email, setEmail] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [older, setOlder] = useState<Message[]>([]);
  const [cursor, setCursor] =
      useState<QueryDocumentSnapshot<DocumentData> | null>(null),
    [hasOlder, setHasOlder] = useState(false);
  const [busy, setBusy] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(true),
    [chatLoading, setChatLoading] = useState(false);
  const [socialState, setSocialState] = useState({ friends: "loading", invites: "loading" });
  const [socialRevision, setSocialRevision] = useState(0);
  const [chatError, setChatError] = useState("");
  const [chatPermissionDenied, setChatPermissionDenied] = useState(false);
  const [chatRevision, setChatRevision] = useState(0);
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.search).get("invite") || "",
  );
  const [received, setReceived] = useState<{
    senderName: string;
    status: string;
  } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const lock = useRef(false),
    messageAttempt = useRef<{
      room: string;
      content: string;
      id: string;
    } | null>(null);
  const bottom = useRef<HTMLDivElement>(null),
    chat = useRef<HTMLDivElement>(null);
  const olderLoaded = useRef(false);
  const previousMessages = useRef<Message[]>([]);
  const scrollNext = useRef(true),
    activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const run = async (key: string, action: () => Promise<void>) => {
    if (lock.current) return;
    if (!navigator.onLine) {
      setError(copy.offlineAction);
      return;
    }
    lock.current = true;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (error) {
      setError(errorText(error, copy.messagesLoadFailed));
    } finally {
      lock.current = false;
      setBusy("");
    }
  };
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let discoveryLoaded = false,
      joinedLoaded = false;
    const finish = () => {
      if (discoveryLoaded && joinedLoaded) setLoading(false);
    };
    const fail = (error: unknown) => {
      setError(errorText(error, copy.messagesLoadFailed));
      setLoading(false);
    };
    setSocialState({ friends: "loading", invites: "loading" });
    const socialFail = (part: "friends" | "invites", error: unknown) => {
      // Friend data is supplementary. A legacy rule must not block groups or chat.
      console.warn("Nexus social data listener failed", error);
      setSocialState((current) => ({ ...current, [part]: "error" }));
    };
    const stop = [
      onSnapshot(
        query(
          collection(db, "communities"),
          where("isPublic", "==", true),
          orderBy("createdAt", "desc"),
          limit(50),
        ),
        (snap) => {
          setRooms(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Room));
          discoveryLoaded = true;
          finish();
        },
        fail,
      ),
      onSnapshot(
        query(
          collection(db, "users", user.uid, "joinedCommunities"),
          limit(100),
        ),
        (snap) => {
          const next = snap.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as Room,
          );
          setJoined(next);
          const selectable = selectableGroups(next);
          setActive((current) =>
            selectable.some((r) => r.id === current) ? current : selectable[0]?.id || "",
          );
          joinedLoaded = true;
          finish();
        },
        fail,
      ),
      onSnapshot(
        query(
          collection(db, "users", user.uid, "friendInvites"),
          orderBy("createdAt", "desc"),
          limit(50),
        ),
        (snap) => {
          setInvites(
            snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Invite),
          );
          setSocialState((current) => ({ ...current, invites: "ready" }));
        },
        (error) => socialFail("invites", error),
      ),
      onSnapshot(
        query(collection(db, "users", user.uid, "friends"), limit(100)),
        (snap) => {
          setFriends(
            snap.docs.map((d) => ({
              name: d.data().displayName || d.data().email || "Friend",
              id: d.id,
            })),
          );
          setSocialState((current) => ({ ...current, friends: "ready" }));
        },
        (error) => socialFail("friends", error),
      ),
    ];
    return () => stop.forEach((fn) => fn());
  }, [user?.uid, socialRevision]);
  const joinedIds = joined.map((group) => group.id).sort().join(",");
  const directoryRoom = useRef(active);
  directoryRoom.current = active;
  const loadMembers = async (after = "") => {
    if (!user || !active || directoryRequest.current) return;
    directoryRequest.current = true;
    const version = ++directoryVersion.current;
    const roomId = active;
    setDirectoryLoading(true);
    setDirectoryError("");
    try {
      const result = await call<CommunityDirectory>("getCommunityMembers", { communityId: roomId, after });
      if (directoryRoom.current !== roomId || directoryVersion.current !== version) return;
      setDirectory((current) => ({ ...result, members: after && current ? [...current.members, ...result.members] : result.members }));
      setGroupDetails((current) => ({ ...current, [roomId]: { count: result.count, state: "ready" } }));
    } catch {
      if (directoryRoom.current === roomId && directoryVersion.current === version) setDirectoryError(copy.directoryLoadFailed);
    } finally {
      if (directoryVersion.current === version) { directoryRequest.current = false; setDirectoryLoading(false); }
    }
  };
  useEffect(() => { directoryVersion.current++; directoryRequest.current = false; setMembersOpen(false); setDirectory(null); setDirectoryError(""); setMemberSearch(""); setDirectoryLoading(false); }, [active, user?.uid]);
  useEffect(() => {
    if (!active || !user) return;
    void loadMembers();
    const refresh = window.setInterval(() => { if (document.visibilityState === "visible" && !membersOpen) void loadMembers(); }, 45000);
    return () => { clearInterval(refresh); directoryVersion.current++; directoryRequest.current = false; };
  }, [membersOpen, active, user?.uid]);
  useEffect(() => {
    if (!user) return;
    let live = true;
    const stops = selectableGroups(joined).map((group) => {
      setGroupDetails((current) => ({ ...current, [group.id]: { state: "loading" } }));
      const fetchCount = () => void call<{ count: number }>("getCommunityMemberCount", { communityId: group.id }).then((result) => {
        if (live) setGroupDetails((current) => ({ ...current, [group.id]: { state: "ready", count: result.count } }));
      }).catch(() => {
        if (live) setGroupDetails((current) => ({ ...current, [group.id]: { state: "error" } }));
      });
      return onSnapshot(doc(db, "communities", group.id), (snapshot) => {
        // Legacy groups can have members/messages without a root metadata document.
        // Count their actual memberships rather than interpreting missing metadata as deletion.
        const data = snapshot.exists() ? snapshot.data() : {};
        const count = data.membersCount ?? data.memberCount;
        if (typeof count === "number" && Number.isFinite(count) && count > 0) {
          setGroupDetails((current) => ({ ...current, [group.id]: { state: "ready", count } }));
        } else {
          fetchCount();
        }
      }, fetchCount);
    });
    return () => { live = false; stops.forEach((stop) => stop()); };
  }, [joinedIds, user?.uid, groupRevision]);
  useEffect(() => {
    setMessages([]);
    setOlder([]);
    setChatError("");
    setChatPermissionDenied(false);
    setCursor(null);
    setHasOlder(false);
    setDraft(
      loadLocalData<string>(`noviq-chat-draft-${user?.uid}-${active}`, ""),
    );
    scrollNext.current = true;
    olderLoaded.current = false;
    previousMessages.current = [];
    if (!active || !user) {
      setChatLoading(false);
      return;
    }
    setChatLoading(true);
    return onSnapshot(
      query(
        collection(db, "communities", active, "messages"),
        orderBy("createdAt", "desc"),
        limit(50),
      ),
      (snap) => {
        scrollNext.current =
          !chat.current ||
          chat.current.scrollHeight -
            chat.current.scrollTop -
            chat.current.clientHeight <
            100;
        const next = snap.docs
          .map((d) => ({ ...d.data(), id: d.id }) as Message)
          .reverse();
        if (olderLoaded.current) {
          const ids = new Set(next.map((m) => m.id));
          const evicted = previousMessages.current.filter(
            (m) => !ids.has(m.id),
          );
          if (evicted.length) setOlder((current) => [...current, ...evicted]);
        }
        previousMessages.current = next;
        setMessages(next);
        if (!olderLoaded.current) {
          setCursor(snap.docs.at(-1) || null);
          setHasOlder(snap.size === 50);
        }
        setChatLoading(false);
      },
      (error) => {
        setChatError(errorText(error, copy.messagesLoadFailed));
        setChatPermissionDenied(error.code === "permission-denied");
        setChatLoading(false);
      },
    );
  }, [active, user?.uid, chatRevision]);
  useEffect(() => {
    if (scrollNext.current)
      bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);
  useEffect(() => {
    if (!token || !user) return;
    let current = true;
    call<{ senderName: string; status: string }>("getFriendInvite", { token })
      .then((data) => {
        if (current) setReceived(data);
      })
      .catch((error) => {
        if (current) setError(errorText(error, copy.messagesLoadFailed));
      });
    return () => {
      current = false;
    };
  }, [token, user?.uid]);
  const dismissInvite = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("invite");
    window.history.replaceState(null, "", url);
    setToken("");
    setReceived(null);
  };
  const selectRoom = (id: string) => {
    setError("");
    setActive(id);
  };
  const send = () =>
    run("send", async () => {
      if (!user || !active || !draft.trim()) return;
      const content = draft.trim(),
        room = active;
      const previous = messageAttempt.current;
      const id =
        previous?.room === room && previous.content === content
          ? previous.id
          : crypto.randomUUID();
      messageAttempt.current = { room, content, id };
      await call("sendCommunityMessage", {
        communityId: room,
        content,
        messageId: id,
      });
      messageAttempt.current = null;
      if (activeRef.current === room)
        setDraft((current) => (current.trim() === content ? "" : current));
      saveLocalData(`noviq-chat-draft-${user.uid}-${room}`, "");
      scrollNext.current = true;
      setStatus(copy.messageSent);
    });
  const room =
    rooms.find((r) => r.id === active) || joined.find((r) => r.id === active);
  const membership = joined.find((r) => r.id === active);
  const allMessages = Array.from(
    new Map([...older, ...messages].map((m) => [m.id, m])).values(),
  ).sort(
    (a, b) =>
      (recordDate(a.createdAt)?.getTime() || 0) -
      (recordDate(b.createdAt)?.getTime() || 0),
  );
  const unresolvedAuthorIds = Array.from(new Set(allMessages.filter((message) =>
    message.userId && message.userId !== user?.uid &&
    messageAuthor(message) === "Former or unnamed member" &&
    !Object.prototype.hasOwnProperty.call(authorLabels[active] || {}, message.userId)
  ).map((message) => message.userId))).slice(0, 10);
  const authorLookupKey = unresolvedAuthorIds.join(",");
  useEffect(() => {
    if (!user || !active || !authorLookupKey) return;
    let live = true;
    setAuthorLookupState((current) => ({ ...current, [active]: "loading" }));
    void call<{ count: number; authors?: Record<string, string | null> }>("getCommunityMemberCount", { communityId: active, authorIds: authorLookupKey.split(",") }).then((result) => {
      if (!result.authors || authorLookupKey.split(",").some((id) => !Object.prototype.hasOwnProperty.call(result.authors, id) || (result.authors?.[id] !== null && typeof result.authors?.[id] !== "string"))) throw new Error("Member name lookup returned an incomplete response.");
      if (live) {
        setAuthorLabels((current) => ({ ...current, [active]: { ...current[active], ...result.authors } }));
        setAuthorLookupState((current) => ({ ...current, [active]: "ready" }));
      }
    }).catch((error: unknown) => {
      console.warn("Nexus author lookup failed", { code: (error as { code?: string })?.code || "unknown" });
      if (live) setAuthorLookupState((current) => ({ ...current, [active]: "error" }));
    });
    return () => { live = false; };
  }, [active, authorLookupKey, user?.uid, groupRevision]);
  const normalizedSearch = groupSearch.trim().toLocaleLowerCase();
  const visibleJoined = useMemo(
    () =>
      selectableGroups(joined).filter((room) =>
        room.name.toLocaleLowerCase().includes(normalizedSearch),
      ),
    [joined, normalizedSearch],
  );
  const discoverableRooms = useMemo(
    () =>
      rooms.filter((room) => !joined.some((member) => member.id === room.id)),
    [rooms, joined],
  );
  const memberCountLabel = (entry: Room) => {
    const detail = groupDetails[entry.id];
    if (detail?.state === "loading") return copy.loadingMembers;
    if (detail?.state === "error") return copy.memberCountFailed;
    if (detail?.state === "missing") return copy.memberCountMissing;
    const count = detail?.count ?? entry.membersCount;
    return typeof count === "number"
      ? count === 1 ? copy.oneMember : formatCommunityCopy(copy.membersCount, { count })
      : copy.memberCountMissing;
  };
  if (!user)
    return (
      <div className={panel}>
        {copy.signIn}
      </div>
    );
  return (
    <div className="community-page min-h-[calc(100dvh-9rem)] rounded-[32px] border border-slate-200 bg-[#f8fbff] p-4 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 sm:p-6">
      <header className="rounded-[26px] border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-7">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10">
            <UsersRound size={30} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{copy.title}</h1>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">
              {copy.subtitle}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-100 pt-5 text-sm font-medium text-slate-500 dark:border-slate-800">
          <span className="inline-flex items-center gap-2">
            <UsersRound size={18} className="text-blue-600" aria-hidden="true" /> {copy.joinStudyGroups}
          </span>
          <span className="inline-flex items-center gap-2">
            <MessageCircle size={18} className="text-blue-600" aria-hidden="true" /> {copy.discussQuestions}
          </span>
          <span className="inline-flex items-center gap-2">
            <UserPlus size={18} className="text-blue-600" aria-hidden="true" /> {copy.inviteFriends}
          </span>
        </div>
      </header>
      {!online && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          {copy.offline}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {error}{" "}
          <button onClick={() => setError("")} className="ml-2 underline">
            {copy.dismiss}
          </button>
        </p>
      )}
      {status && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl bg-green-50 p-3 text-green-800"
        >
          {status}
        </p>
      )}
      {token && (
        <section className={panel}>
          <h2 className="font-semibold">{copy.friendInvitation}</h2>
          <p className="my-3">
            {received
              ? received.status === "accepted"
                ? copy.invitationAccepted
                : formatCommunityCopy(copy.invitedBy, { name: received.senderName })
              : copy.checkingInvitation}
          </p>
          {received?.status === "pending" && (
            <button
              className={button}
              disabled={!!busy || !online}
              onClick={() =>
                run("accept", async () => {
                  await user.reload();
                  await user.getIdToken(true);
                  await call("acceptFriendInvite", { token });
                  dismissInvite();
                  setStatus(copy.friendAdded);
                })
              }
            >
              {busy === "accept" ? copy.accepting : copy.acceptInvitation}
            </button>
          )}
          {!user.emailVerified && (
            <button
              className="ml-3 underline"
              disabled={!!busy}
              onClick={() =>
                run("verify", async () => {
                  await sendEmailVerification(user);
                  setStatus(copy.verificationSent);
                })
              }
            >
              {copy.verifyEmail}
            </button>
          )}
          <button className="ml-3 underline" onClick={dismissInvite}>
            {copy.dismissInvitation}
          </button>
        </section>
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.6fr)_minmax(270px,0.8fr)]">
        <aside className="space-y-5">
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <UsersRound size={22} className="text-blue-600" aria-hidden="true" /> {copy.myGroups}
              </h2>
              <button
                type="button"
                aria-label={copy.createGroup}
                onClick={() => setCreateOpen((current) => !current)}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500"
              >
                <Plus size={17} />
              </button>
            </div>
            {createOpen && (
              <form
                className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-500/20 dark:bg-blue-500/5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("create", async () => {
                    const result = await call<{ communityId: string }>(
                      "createCommunity",
                      { name, description },
                    );
                    setActive(result.communityId);
                    setName("");
                    setDescription("");
                    setCreateOpen(false);
                    setStatus(copy.studyGroupCreated);
                  });
                }}
              >
                <label className="sr-only" htmlFor="community-name">
                  {copy.groupName}
                </label>
                <input
                  id="community-name"
                  className={`${field} mb-2`}
                  placeholder={copy.groupName}
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <label className="sr-only" htmlFor="community-description">
                  {copy.description}
                </label>
                <textarea
                  id="community-description"
                  className={`${field} mb-2 min-h-20 resize-y`}
                  placeholder={copy.descriptionOptional}
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className={`${button} flex-1`}
                    disabled={!!busy || !online || !name.trim()}
                  >
                    {busy === "create" ? copy.creating : copy.createGroup}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    aria-label={copy.cancelGroupCreation}
                    className="rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    <X size={17} />
                  </button>
                </div>
              </form>
            )}
            <label className="relative mt-4 block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={17}
              />
              <input
                aria-label={copy.searchGroups}
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800"
                placeholder={copy.searchGroupsPlaceholder}
              />
            </label>
            <div className="mt-3 space-y-1">
              {loading ? (
                <p role="status" className="py-4 text-sm text-slate-500">
                  {copy.loadingGroups}
                </p>
              ) : !joined.length ? (
                <div className="py-7 text-center text-sm text-slate-500">
                  <UsersRound
                    className="mx-auto mb-2 text-slate-300"
                    size={28}
                  />
                  {copy.noJoinedGroups}
                </div>
              ) : !visibleJoined.length ? (
                <p className="py-5 text-center text-sm text-slate-500">
                  {copy.noMatchingGroups}
                </p>
              ) : (
                visibleJoined.map((r) => (
                  <button
                    key={r.id}
                    aria-pressed={active === r.id}
                    onClick={() => selectRoom(r.id)}
                    className={`flex w-full items-center gap-3 break-words rounded-2xl px-3 py-3 text-left transition-colors ${active === r.id ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/15">
                      <GraduationCap size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.name}</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-500">
                        {memberCountLabel(r)}
                      </span>
                    </span>
                    <ChevronRight
                      size={17}
                      className="shrink-0 text-slate-400"
                    />
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Compass size={22} className="text-blue-600" />
              <h2 className="text-lg font-black">{copy.discoverGroups}</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {copy.discoverDescription}
            </p>
            <div className="mt-4 space-y-3">
              {discoverableRooms.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800"
                >
                  <h3 className="break-words font-bold">{r.name}</h3>
                  {r.description && (
                    <p className="mt-1 line-clamp-2 break-words text-sm text-slate-500">
                      {r.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {memberCountLabel(r)}
                  </p>
                  <button
                    className={`${button} mt-3 w-full`}
                    disabled={!!busy || !online}
                    onClick={() =>
                      run(r.id, async () => {
                        await call("joinCommunity", { communityId: r.id });
                        setActive(r.id);
                        setStatus(copy.groupJoined);
                      })
                    }
                  >
                    {busy === r.id ? copy.joining : copy.joinGroup}
                  </button>
                </div>
              ))}
              {!loading && !discoverableRooms.length && (
                <p className="py-4 text-center text-sm text-slate-500">
                  {copy.noPublicGroups}
                </p>
              )}
            </div>
          </section>
        </aside>
        <section className="flex min-h-[560px] min-w-0 flex-col rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:h-[calc(100dvh-16.5rem)]">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-nowrap">
            <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10">
                <GraduationCap size={23} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black">
                  <button type="button" disabled={!membership} onClick={() => setMembersOpen(true)}>{room?.name || copy.studyChat}</button>
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {room
                    ? formatCommunityCopy(copy.messagesVisible, { members: memberCountLabel(room) })
                    : copy.chooseGroup}
                </p>
                {groupDetails[active]?.state === "error" && <button type="button" className="mt-2 text-sm text-blue-700 underline dark:text-blue-300" onClick={() => setGroupRevision((current) => current + 1)}>{copy.retryMemberCount}</button>}
                {authorLookupState[active] === "error" && <p role="alert" className="mt-2 text-sm text-slate-500 dark:text-slate-400">{copy.authorNamesFailed} <button type="button" className="underline" onClick={() => setGroupRevision((value) => value + 1)}>{copy.retryAuthorNames}</button></p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {membership && <button type="button" className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-blue-700 dark:border-slate-700 dark:text-blue-300" aria-label={copy.viewMembers} onClick={() => setMembersOpen(true)}><UsersRound size={22} aria-hidden="true" /></button>}
              {membership && membership.role !== "owner" && (
                <button
                  className="text-sm font-semibold text-slate-500 underline hover:text-red-600"
                  disabled={!!busy || !!draft.trim()}
                  onClick={() =>
                    run("leave", async () => {
                      await call("leaveCommunity", { communityId: active });
                      setStatus(copy.leftGroup);
                    })
                  }
                >
                  {copy.leave}
                </button>
              )}
            </div>
          </header>
          {directory && <p className="pt-2 text-xs text-slate-500 dark:text-slate-400">{formatCommunityCopy(copy.onlineSummary, { members: directory.count === 1 ? copy.oneMember : formatCommunityCopy(copy.membersCount, { count: directory.count }), online: directory.onlineCount === null ? copy.onlineUnavailableGroup : formatCommunityCopy(copy.onlineCount, { count: directory.onlineCount }) })}</p>}
          {membersOpen && (
            <CommunityMembersDialog
              copy={copy}
              directory={directory}
              error={directoryError}
              loading={directoryLoading}
              locale={locale}
              onClose={() => setMembersOpen(false)}
              onLoadMore={() => void loadMembers(directory?.nextCursor || "")}
              onRefresh={() => void loadMembers()}
              onSearchChange={setMemberSearch}
              roomName={room?.name}
              search={memberSearch}
              userId={user.uid}
            />
          )}
          <div
            ref={chat}
            role="log"
            aria-label={copy.groupMessages}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-5"
          >
            {hasOlder && cursor && (
              <button
                className="w-full text-sm text-blue-700 underline"
                disabled={!!busy}
                onClick={() =>
                  run("older", async () => {
                    const roomId = active;
                    const result = await getDocs(
                      query(
                        collection(db, "communities", roomId, "messages"),
                        orderBy("createdAt", "desc"),
                        startAfter(cursor),
                        limit(50),
                      ),
                    );
                    if (activeRef.current !== roomId) return;
                    olderLoaded.current = true;
                    setOlder((current) => [
                      ...result.docs.map(
                        (d) => ({ ...d.data(), id: d.id }) as Message,
                      ),
                      ...current,
                    ]);
                    setCursor(result.docs.at(-1) || cursor);
                    setHasOlder(result.size === 50);
                  })
                }
              >
                {busy === "older" ? copy.loading : copy.loadOlderMessages}
              </button>
            )}
            {chatError ? (
              <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <MessageCircle
                  className="mx-auto mb-3 text-amber-600"
                  size={32}
                />
                <p className="font-semibold">
                  {chatPermissionDenied
                    ? copy.membershipRefreshNeeded
                    : copy.messagesLoadFailed}
                </p>
                <p className="mt-2 text-sm opacity-80">
                  {copy.reconnectHelp}
                </p>
                <button
                  className={`${button} mt-4`}
                  disabled={!active || !!busy || !online}
                  onClick={() =>
                    run("reconnect", async () => {
                      const roomId = active;
                      if (chatPermissionDenied)
                        await call("joinCommunity", { communityId: roomId });
                      if (activeRef.current === roomId)
                        setChatRevision((current) => current + 1);
                    })
                  }
                >
                  {busy === "reconnect"
                    ? copy.reconnecting
                    : chatPermissionDenied
                      ? copy.reconnectGroup
                      : copy.retryMessages}
                </button>
              </div>
            ) : chatLoading ? (
              <p
                role="status"
                className="py-10 text-center text-sm text-slate-500"
              >
                {copy.loadingMessages}
              </p>
            ) : !allMessages.length ? (
              <div className="py-16 text-center text-slate-500">
                <MessageCircle
                  className="mx-auto mb-3 text-slate-300"
                  size={34}
                />
                {active
                  ? copy.noMessages
                  : copy.conversationPlaceholder}
              </div>
            ) : (
              allMessages.map((m) => (
                <article
                  key={m.id}
                  className={`max-w-[88%] rounded-2xl p-3.5 ${m.userId === user.uid ? "chat-user-message ml-auto bg-blue-600 text-white shadow-sm" : "mr-auto bg-slate-50 dark:bg-slate-800"}`}
                >
                  <p
                    className={`text-xs font-semibold ${m.userId === user.uid ? "text-blue-100" : "text-slate-500"}`}
                  >
                    {m.userId === user.uid ? copy.you : resolveMessageAuthor(m, authorLabels[active]?.[m.userId], authorLookupState[active])}
                    <time
                      className="ml-2 font-normal"
                      dateTime={recordDate(m.createdAt)?.toISOString()}
                    >
                      {recordDate(m.createdAt)?.toLocaleTimeString(locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words">
                    {m.content}
                  </p>
                </article>
              ))
            )}
            <div ref={bottom} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="border-t border-slate-100 pt-4 dark:border-slate-800"
          >
            <label htmlFor="community-message" className="sr-only">
              {copy.message}
            </label>
            <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-blue-400 focus-within:bg-white dark:border-slate-700 dark:bg-slate-800">
              <textarea
                id="community-message"
                className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
                rows={1}
                maxLength={2000}
                disabled={!active || !!chatError || busy === "send"}
                placeholder={
                  chatError
                    ? copy.reconnectToSend
                    : active
                      ? copy.writeMessage
                      : copy.joinToSend
                }
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  saveLocalData(
                    `noviq-chat-draft-${user.uid}-${active}`,
                    e.target.value,
                  );
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                aria-label={copy.sendMessage}
                className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !active || !!chatError || !draft.trim() || !!busy || !online
                }
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </div>
            <span className="mt-2 block text-xs text-slate-500">
              {copy.sendHint}
            </span>
          </form>
        </section>
        <aside className="space-y-5">
          <form
            className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            onSubmit={(e) => {
              e.preventDefault();
              void run("invite", async () => {
                const result = await call<{ token: string }>(
                  "createFriendInvite",
                  { email },
                );
                const link = `${window.location.origin}${window.location.pathname}?invite=${result.token}#/community`;
                setEmail("");
                setStatus(copy.inviteCreated);
                try {
                  await navigator.clipboard.writeText(link);
                  setStatus(copy.inviteCopiedLong);
                } catch {
                  /* The visible link remains available for manual copying. */
                }
              });
            }}
          >
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Send className="text-blue-600" size={21} aria-hidden="true" /> {copy.inviteFriendsTitle}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {copy.inviteDescription}
            </p>
            <label className="text-sm">
              <span className="sr-only">{copy.friendEmail}</span>
              <input
                className={`${field} my-2`}
                type="email"
                placeholder={copy.friendEmail}
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              className={`${button} w-full`}
              disabled={!!busy || !online || !email.trim()}
            >
              {busy === "invite" ? copy.creating : copy.createInvitationLink}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              {copy.inviteHelp}
            </p>
          </form>
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Sparkles className="text-blue-600" size={21} aria-hidden="true" /> {copy.sentInvitations}
            </h2>
            {socialState.invites === "loading" && <p role="status" className="text-sm text-slate-500">{copy.loadingInvitations}</p>}
            {socialState.invites === "error" && <p role="alert" className="text-sm text-slate-500">{copy.invitationsFailed} <button type="button" className="underline" onClick={() => setSocialRevision((value) => value + 1)}>{copy.retryInvitations}</button></p>}
            {socialState.invites === "ready" && !invites.length && (
              <p className="text-sm text-slate-500">{copy.noInvitations}</p>
            )}
            {invites.map((invite) => {
              const expired =
                !!invite.expiresAt &&
                Date.parse(invite.expiresAt) <= Date.now();
              const link = invite.token
                ? `${window.location.origin}${window.location.pathname}?invite=${invite.token}#/community`
                : "";
              return (
                <div key={invite.id} className="mb-4">
                  <p className="break-all text-sm">{invite.email}</p>
                  <p className="my-1 text-xs text-slate-500">
                    {invite.status === "accepted"
                      ? copy.accepted
                      : expired
                        ? copy.expired
                        : link
                          ? copy.awaitingFriend
                          : copy.oldInvitation}
                  </p>
                  {link && !expired && invite.status === "pending" && (
                    <>
                      <input
                        aria-label={formatCommunityCopy(copy.invitationLinkFor, { email: invite.email })}
                        readOnly
                        className={`${field} mb-2 text-xs`}
                        value={link}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        className="text-sm text-blue-700 underline"
                        onClick={() =>
                          run("copy", async () => {
                            if (!navigator.clipboard)
                              throw new Error(
                                copy.selectCopyLink,
                              );
                            await navigator.clipboard.writeText(link);
                            setStatus(copy.invitationCopied);
                          })
                        }
                      >
                        {copy.copyLink}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </section>
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <CircleUserRound className="text-blue-600" size={21} aria-hidden="true" /> {copy.friends}
            </h2>
            {socialState.friends === "loading" && <p role="status" className="text-sm text-slate-500">{copy.loadingFriends}</p>}
            {socialState.friends === "error" && <p role="alert" className="text-sm text-slate-500">{copy.friendsFailed} <button type="button" className="underline" onClick={() => setSocialRevision((value) => value + 1)}>{copy.retryFriends}</button></p>}
            {friends.length ? (
              friends.map((friend) => (
                <p
                  key={friend.id}
                  className="mb-2 flex items-center gap-2 break-words rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold dark:bg-slate-800"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
                    <CircleUserRound size={16} />
                  </span>
                  {friend.name}
                </p>
              ))
            ) : socialState.friends === "ready" ? (
              <p className="text-sm text-slate-500">{copy.noFriends}</p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
};
