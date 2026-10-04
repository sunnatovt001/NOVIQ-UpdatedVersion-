import {
  loadLocalData,
  trySaveLocalData as saveLocalData,
} from "@/src/lib/localStore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useDialogFocus } from "@/src/lib/useDialogFocus";

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
type GroupMember = { uid: string; displayName: string; username: string | null; role: string; online: boolean; lastSeenAt: string | null };
type MemberDirectory = { count: number; onlineCount: number | null; members: GroupMember[]; nextCursor: string | null; measuredAt: string };
const call = async <T,>(
  name: string,
  data: Record<string, unknown>,
): Promise<T> => {
  if (isReadOnlyAudit && !["getCommunityMemberCount", "getCommunityMembers", "getFriendInvite"].includes(name)) throw new Error("Group writes and invitations are disabled in read-only audit mode.");
  return (await httpsCallable<Record<string, unknown>, T>(functions, name, { timeout: 20000 })(data)).data;
};
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const button =
  "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";
const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const selectableGroups = (groups: Room[]) => {
  const lastSat = groups.reduce((last, group, index) => group.name.trim().toLowerCase() === "sat" ? index : last, -1);
  return groups.filter((group, index) => group.name.trim().toLowerCase() !== "sat" || index === lastSat);
};
export const Community = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]),
    [joined, setJoined] = useState<Room[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]),
    [friends, setFriends] = useState<Room[]>([]);
  const [active, setActive] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [directory, setDirectory] = useState<MemberDirectory | null>(null);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const directoryRequest = useRef(false);
  const directoryVersion = useRef(0);
  const membersPanel = useRef<HTMLDivElement>(null);
  useDialogFocus(membersOpen, membersPanel, () => setMembersOpen(false));
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
      setError("You are offline. Reconnect to continue; your draft is kept.");
      return;
    }
    lock.current = true;
    setBusy(key);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (error) {
      setError(errorText(error));
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
      setError(errorText(error));
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
      const result = await call<MemberDirectory>("getCommunityMembers", { communityId: roomId, after });
      if (directoryRoom.current !== roomId || directoryVersion.current !== version) return;
      setDirectory((current) => ({ ...result, members: after && current ? [...current.members, ...result.members] : result.members }));
      setGroupDetails((current) => ({ ...current, [roomId]: { count: result.count, state: "ready" } }));
    } catch {
      if (directoryRoom.current === roomId && directoryVersion.current === version) setDirectoryError("Group members could not be loaded. The members service may need updating. Please retry.");
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
        setChatError(errorText(error));
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
        if (current) setError(errorText(error));
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
      setStatus("Message sent.");
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
    if (detail?.state === "loading") return "Loading members…";
    if (detail?.state === "error") return "Could not load member count";
    if (detail?.state === "missing") return "Member count not recorded";
    const count = detail?.count ?? entry.membersCount;
    return typeof count === "number" ? `${count} member${count === 1 ? "" : "s"}` : "Member count not recorded";
  };
  if (!user)
    return (
      <div className={panel}>
        Sign in to join study groups and chat with friends.
      </div>
    );
  return (
    <div className="min-h-[calc(100dvh-9rem)] rounded-[32px] border border-slate-200 bg-[#f8fbff] p-4 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950 sm:p-6">
      <header className="rounded-[26px] border border-slate-200 bg-white px-5 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-7">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10">
            <UsersRound size={30} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Nexus</h1>
            <p className="mt-1 text-sm text-slate-500 sm:text-base">
              Study together, share ideas, and stay motivated with your friends.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-100 pt-5 text-sm font-medium text-slate-500 dark:border-slate-800">
          <span className="inline-flex items-center gap-2">
            <UsersRound size={18} className="text-blue-600" /> Join study groups
          </span>
          <span className="inline-flex items-center gap-2">
            <MessageCircle size={18} className="text-blue-600" /> Discuss
            questions
          </span>
          <span className="inline-flex items-center gap-2">
            <UserPlus size={18} className="text-blue-600" /> Invite friends
          </span>
        </div>
      </header>
      {!online && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-amber-900">
          You are offline. Messages will update when your connection returns.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {error}{" "}
          <button onClick={() => setError("")} className="ml-2 underline">
            Dismiss
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
          <h2 className="font-semibold">Friend invitation</h2>
          <p className="my-3">
            {received
              ? received.status === "accepted"
                ? "This invitation has already been accepted."
                : `${received.senderName} invited you to connect.`
              : "Checking invitation… Sign in with the invited email address."}
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
                  setStatus("Friend added to both accounts.");
                })
              }
            >
              {busy === "accept" ? "Accepting…" : "Accept invitation"}
            </button>
          )}
          {!user.emailVerified && (
            <button
              className="ml-3 underline"
              disabled={!!busy}
              onClick={() =>
                run("verify", async () => {
                  await sendEmailVerification(user);
                  setStatus(
                    "Verification email sent. Open the link in your email, then accept the invitation again.",
                  );
                })
              }
            >
              Verify my email
            </button>
          )}
          <button className="ml-3 underline" onClick={dismissInvite}>
            Dismiss invitation
          </button>
        </section>
      )}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(250px,0.72fr)_minmax(0,1.6fr)_minmax(270px,0.8fr)]">
        <aside className="space-y-5">
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <UsersRound size={22} className="text-blue-600" /> My Groups
              </h2>
              <button
                type="button"
                aria-label="Create group"
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
                    setStatus("Study group created.");
                  });
                }}
              >
                <label className="sr-only" htmlFor="community-name">
                  Group name
                </label>
                <input
                  id="community-name"
                  className={`${field} mb-2`}
                  placeholder="Group name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <label className="sr-only" htmlFor="community-description">
                  Description
                </label>
                <textarea
                  id="community-description"
                  className={`${field} mb-2 min-h-20 resize-y`}
                  placeholder="Description (optional)"
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
                    {busy === "create" ? "Creating…" : "Create group"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    aria-label="Cancel group creation"
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
                aria-label="Search groups"
                value={groupSearch}
                onChange={(event) => setGroupSearch(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800"
                placeholder="Search groups..."
              />
            </label>
            <div className="mt-3 space-y-1">
              {loading ? (
                <p role="status" className="py-4 text-sm text-slate-500">
                  Loading groups…
                </p>
              ) : !joined.length ? (
                <div className="py-7 text-center text-sm text-slate-500">
                  <UsersRound
                    className="mx-auto mb-2 text-slate-300"
                    size={28}
                  />
                  You haven't joined any study groups yet.
                </div>
              ) : !visibleJoined.length ? (
                <p className="py-5 text-center text-sm text-slate-500">
                  No matching groups.
                </p>
              ) : (
                visibleJoined.map((r) => (
                  <button
                    key={r.id}
                    aria-pressed={active === r.id}
                    onClick={() => selectRoom(r.id)}
                    className={`flex w-full items-center gap-3 break-words rounded-2xl px-3 py-3 text-left transition ${active === r.id ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
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
              <h2 className="text-lg font-black">Discover Groups</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Join public study groups with similar goals.
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
                        setStatus("Group joined.");
                      })
                    }
                  >
                    {busy === r.id ? "Joining…" : "Join group"}
                  </button>
                </div>
              ))}
              {!loading && !discoverableRooms.length && (
                <p className="py-4 text-center text-sm text-slate-500">
                  No public groups available yet.
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
                  <button type="button" disabled={!membership} onClick={() => setMembersOpen(true)}>{room?.name || "Study chat"}</button>
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {room
                    ? `${memberCountLabel(room)} · Messages are visible to group members.`
                    : "Choose or join a group to start chatting."}
                </p>
                {groupDetails[active]?.state === "error" && <button type="button" className="mt-2 text-sm text-blue-700 underline" onClick={() => setGroupRevision((current) => current + 1)}>Retry member count</button>}
                {authorLookupState[active] === "error" && <p role="alert" className="mt-2 text-sm text-slate-500">Some author names could not be loaded. <button type="button" className="underline" onClick={() => setGroupRevision((value) => value + 1)}>Retry author names</button></p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {membership && <button type="button" className="rounded-xl border border-slate-200 p-2 text-blue-700" aria-label="View group members" onClick={() => setMembersOpen(true)}><UsersRound size={22} /></button>}
              {membership && membership.role !== "owner" && (
                <button
                  className="text-sm font-semibold text-slate-500 underline hover:text-red-600"
                  disabled={!!busy || !!draft.trim()}
                  onClick={() =>
                    run("leave", async () => {
                      await call("leaveCommunity", { communityId: active });
                      setStatus("You left the group.");
                    })
                  }
                >
                  Leave
                </button>
              )}
            </div>
          </header>
          {directory && <p className="pt-2 text-xs text-slate-500">{directory.count} members · {directory.onlineCount === null ? "Online count unavailable for this group" : `${directory.onlineCount} online`} · Online means an active website tab within the last 2 minutes.</p>}
          {membersOpen && createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setMembersOpen(false)}>
            <div ref={membersPanel} role="dialog" aria-modal="true" aria-labelledby="group-members-heading" className="flex max-h-[85dvh] w-full max-w-lg min-w-0 flex-col rounded-2xl bg-white p-5 text-slate-900 dark:bg-slate-900 dark:text-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-2"><h2 id="group-members-heading" className="text-xl font-bold">{room?.name} · Members</h2><button type="button" aria-label="Close group members" className="grid h-11 w-11 place-items-center" onClick={() => setMembersOpen(false)}><X /></button></div>
              <p className="mb-3 text-sm text-slate-500">{directory ? `${directory.count} members · ${directory.onlineCount === null ? "Online count unavailable" : `${directory.onlineCount} online`}` : directoryLoading ? "Loading member directory…" : "Member directory unavailable"}</p>
              <input className={field} aria-label="Search loaded group members" placeholder="Search loaded names or usernames" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
              {directory && <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500"><span>Updated {recordDate(directory.measuredAt)?.toLocaleTimeString()}</span><button type="button" className="text-blue-700 underline" disabled={directoryLoading} onClick={() => void loadMembers()}>Refresh members</button></div>}
              {directoryError && <div role="alert" className="my-3 text-sm text-red-600">{directoryError} <button type="button" className="underline" disabled={directoryLoading} onClick={() => void loadMembers()}>Retry</button></div>}
              <ul className="my-3 min-h-0 overflow-y-auto" aria-label="Group members">{directory?.members.filter((member) => `${member.displayName} ${member.username || ""}`.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase())).map((member) => <li key={member.uid} className="flex items-center gap-3 border-b border-slate-100 py-3 dark:border-slate-800"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700">{member.displayName.slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="break-words font-semibold">{member.displayName}{member.uid === user?.uid ? " (you)" : ""}</p><p className="break-words text-xs text-slate-500">{member.username ? `@${member.username.replace(/^@/, "")}` : "Username not set"} · {member.role}</p><p className="text-xs text-slate-500">{member.online ? "Online" : member.lastSeenAt && recordDate(member.lastSeenAt) ? `Last active ${recordDate(member.lastSeenAt)?.toLocaleString()}` : "Presence not available"}</p></div>{member.online && <span aria-label="Online" className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}</li>)}</ul>
              {directory?.nextCursor && <button type="button" className={button} disabled={directoryLoading} onClick={() => void loadMembers(directory.nextCursor || "")}>Load more members</button>}
              {directoryLoading && <p role="status" className="mt-2 text-sm">Loading members…</p>}
              {directory && !directory.members.length && !directoryLoading && <p>No members found.</p>}
              {directory && directory.members.length > 0 && !directory.members.some((member) => `${member.displayName} ${member.username || ""}`.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase())) && <p>No loaded members match your search.</p>}
              <p className="mt-2 text-xs text-slate-500">Online indicates a visible website tab with a heartbeat in the last 2 minutes. Search applies to loaded members; load more to search further.</p>
            </div>
          </div>, document.body)}
          <div
            ref={chat}
            role="log"
            aria-label="Group messages"
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
                {busy === "older" ? "Loading…" : "Load older messages"}
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
                    ? "This group needs its membership connection refreshed."
                    : "Messages could not be loaded. Please try again."}
                </p>
                <p className="mt-2 text-sm opacity-80">
                  Your group and messages are unchanged. Reconnect restores
                  access for this account.
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
                    ? "Reconnecting…"
                    : chatPermissionDenied
                      ? "Reconnect to group"
                      : "Retry messages"}
                </button>
              </div>
            ) : chatLoading ? (
              <p
                role="status"
                className="py-10 text-center text-sm text-slate-500"
              >
                Loading messages…
              </p>
            ) : !allMessages.length ? (
              <div className="py-16 text-center text-slate-500">
                <MessageCircle
                  className="mx-auto mb-3 text-slate-300"
                  size={34}
                />
                {active
                  ? "No messages yet. Start the conversation."
                  : "Your group conversation will appear here."}
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
                    {m.userId === user.uid ? "You" : resolveMessageAuthor(m, authorLabels[active]?.[m.userId], authorLookupState[active])}
                    <time
                      className="ml-2 font-normal"
                      dateTime={recordDate(m.createdAt)?.toISOString()}
                    >
                      {recordDate(m.createdAt)?.toLocaleTimeString([], {
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
              Message
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
                    ? "Reconnect to send a message"
                    : active
                      ? "Write a message…"
                      : "Join a group to send messages"
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
                aria-label="Send message"
                className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !active || !!chatError || !draft.trim() || !!busy || !online
                }
              >
                <Send size={18} />
              </button>
            </div>
            <span className="mt-2 block text-xs text-slate-500">
              Enter to send · Shift + Enter for a new line
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
                setStatus(
                  "Invitation link created. Copy it below and share it with your friend; it expires in 7 days.",
                );
                try {
                  await navigator.clipboard.writeText(link);
                  setStatus(
                    "Invitation link copied. Share it with your friend; it expires in 7 days.",
                  );
                } catch {
                  /* The visible link remains available for manual copying. */
                }
              });
            }}
          >
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Send className="text-blue-600" size={21} /> Invite Friends
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Bring friends to Noviq and study together.
            </p>
            <label className="text-sm">
              <span className="sr-only">Friend's email</span>
              <input
                className={`${field} my-2`}
                type="email"
                placeholder="Friend's email"
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
              {busy === "invite" ? "Creating…" : "Create invitation link"}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Share the link yourself. Only the invited email can accept it.
            </p>
          </form>
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Sparkles className="text-amber-500" size={21} /> Sent invitations
            </h2>
            {socialState.invites === "loading" && <p role="status" className="text-sm text-slate-500">Loading invitations…</p>}
            {socialState.invites === "error" && <p role="alert" className="text-sm text-slate-500">Invitations could not be loaded. <button type="button" className="underline" onClick={() => setSocialRevision((value) => value + 1)}>Retry invitations</button></p>}
            {socialState.invites === "ready" && !invites.length && (
              <p className="text-sm text-slate-500">No invitations sent yet.</p>
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
                      ? "Accepted"
                      : expired
                        ? "Expired"
                        : link
                          ? "Awaiting your friend"
                          : "Old invitation — create a new link"}
                  </p>
                  {link && !expired && invite.status === "pending" && (
                    <>
                      <input
                        aria-label={`Invitation link for ${invite.email}`}
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
                                "Select and copy the invitation link above.",
                              );
                            await navigator.clipboard.writeText(link);
                            setStatus("Invitation link copied.");
                          })
                        }
                      >
                        Copy link
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </section>
          <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <CircleUserRound className="text-emerald-600" size={21} /> Friends
            </h2>
            {socialState.friends === "loading" && <p role="status" className="text-sm text-slate-500">Loading friends…</p>}
            {socialState.friends === "error" && <p role="alert" className="text-sm text-slate-500">Friends could not be loaded. <button type="button" className="underline" onClick={() => setSocialRevision((value) => value + 1)}>Retry friends</button></p>}
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
              <p className="text-sm text-slate-500">No friends here yet.</p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
};
