import {
  loadLocalData,
  trySaveLocalData as saveLocalData,
} from "@/src/lib/localStore";
import React, { useEffect, useRef, useState } from "react";
import {
  collection,
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
  createdAt?: { toDate: () => Date };
};
const call = async <T,>(
  name: string,
  data: Record<string, unknown>,
): Promise<T> =>
  (await httpsCallable<Record<string, unknown>, T>(functions, name)(data)).data;
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const button =
  "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";
const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
export const Community = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]),
    [joined, setJoined] = useState<Room[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]),
    [friends, setFriends] = useState<Room[]>([]);
  const [active, setActive] = useState("");
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [email, setEmail] = useState("");
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
          setActive((current) =>
            next.some((r) => r.id === current) ? current : next[0]?.id || "",
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
        (snap) =>
          setInvites(
            snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Invite),
          ),
        fail,
      ),
      onSnapshot(
        query(collection(db, "users", user.uid, "friends"), limit(100)),
        (snap) =>
          setFriends(
            snap.docs.map((d) => ({
              name: d.data().displayName || d.data().email || "Friend",
              id: d.id,
            })),
          ),
        fail,
      ),
    ];
    return () => stop.forEach((fn) => fn());
  }, [user?.uid]);
  useEffect(() => {
    setMessages([]);
    setOlder([]);
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
        setError(errorText(error));
        setChatLoading(false);
      },
    );
  }, [active, user?.uid]);
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
    if (draft.trim()) {
      setError("Send or clear your current message before switching groups.");
      return;
    }
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
      (a.createdAt?.toDate().getTime() || 0) -
      (b.createdAt?.toDate().getTime() || 0),
  );
  if (!user)
    return (
      <div className={panel}>
        Sign in to join study groups and chat with friends.
      </div>
    );
  return (
    <div className="space-y-5 text-slate-900">
      <header>
        <h1 className="text-2xl font-bold">Community</h1>
        <p className="mt-1 text-slate-600">
          Study together, share questions, and connect with friends.
        </p>
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
      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)_240px]">
        <aside className="space-y-5">
          <form
            className={panel}
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
                setStatus("Study group created.");
              });
            }}
          >
            <h2 className="mb-3 font-semibold">Create a study group</h2>
            <label className="text-sm">
              Group name
              <input
                className={`${field} mt-1 mb-3`}
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Description (optional)
              <textarea
                className={`${field} mt-1 mb-3`}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <button
              className={`${button} w-full`}
              disabled={!!busy || !online || !name.trim()}
            >
              {busy === "create" ? "Creating…" : "Create group"}
            </button>
          </form>
          <section className={panel}>
            <h2 className="mb-3 font-semibold">Your groups</h2>
            {loading ? (
              <p role="status">Loading groups…</p>
            ) : !joined.length ? (
              <p className="text-sm text-slate-600">
                Join a group below or create your own.
              </p>
            ) : (
              joined.map((r) => (
                <button
                  key={r.id}
                  aria-pressed={active === r.id}
                  onClick={() => selectRoom(r.id)}
                  className={`mb-2 w-full break-words rounded-xl px-3 py-2 text-left ${active === r.id ? "bg-blue-50 font-semibold text-blue-800" : "hover:bg-slate-50"}`}
                >
                  {r.name}
                </button>
              ))
            )}
          </section>
          <section className={panel}>
            <h2 className="mb-3 font-semibold">Discover groups</h2>
            {rooms
              .filter((r) => !joined.some((j) => j.id === r.id))
              .map((r) => (
                <div key={r.id} className="mb-4">
                  <h3 className="break-words font-medium">{r.name}</h3>
                  <p className="my-1 break-words text-sm text-slate-600">
                    {r.description}
                  </p>
                  <p className="mb-2 text-xs text-slate-500">
                    {r.membersCount || 0} members
                  </p>
                  <button
                    className={button}
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
            {!loading &&
              !rooms.some((r) => !joined.some((j) => j.id === r.id)) && (
                <p className="text-sm text-slate-600">
                  No more groups available yet.
                </p>
              )}
          </section>
        </aside>
        <section
          className={`${panel} flex h-[70vh] min-h-[420px] min-w-0 flex-col`}
        >
          <header className="flex items-center justify-between gap-3 border-b pb-3">
            <div>
              <h2 className="break-words font-semibold">
                {room?.name || "Study chat"}
              </h2>
              <p className="text-sm text-slate-600">
                {room
                  ? "Messages are visible to group members."
                  : "Choose or join a group to start chatting."}
              </p>
            </div>
            {membership && membership.role !== "owner" && (
              <button
                className="text-sm text-slate-600 underline"
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
          </header>
          <div
            ref={chat}
            role="log"
            aria-label="Group messages"
            className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4"
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
            {chatLoading ? (
              <p role="status">Loading messages…</p>
            ) : !allMessages.length ? (
              <p className="py-10 text-center text-slate-500">
                {active
                  ? "No messages yet. Start the conversation."
                  : "Your group conversation will appear here."}
              </p>
            ) : (
              allMessages.map((m) => (
                <article
                  key={m.id}
                  className={`rounded-xl p-3 ${m.userId === user.uid ? "ml-6 bg-blue-50" : "mr-6 bg-slate-50"}`}
                >
                  <p className="text-xs font-semibold text-slate-600">
                    {m.userId === user.uid ? "You" : m.displayName}
                    <time
                      className="ml-2 font-normal"
                      dateTime={m.createdAt?.toDate().toISOString()}
                    >
                      {m.createdAt?.toDate().toLocaleTimeString([], {
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
            className="border-t pt-3"
          >
            <label htmlFor="community-message" className="sr-only">
              Message
            </label>
            <textarea
              id="community-message"
              className={field}
              rows={2}
              maxLength={2000}
              disabled={!active || busy === "send"}
              placeholder={
                active ? "Write a message…" : "Join a group to send messages"
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
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                Enter to send · Shift + Enter for a new line
              </span>
              <button
                className={button}
                disabled={!active || !draft.trim() || !!busy || !online}
              >
                {busy === "send" ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </section>
        <aside className="space-y-5 xl:col-span-2 xl:grid xl:grid-cols-3 xl:gap-4 xl:space-y-0 2xl:col-span-1 2xl:block 2xl:space-y-5">
          <form
            className={panel}
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
            <h2 className="mb-3 font-semibold">Invite a friend</h2>
            <label className="text-sm">
              Friend's email
              <input
                className={`${field} my-2`}
                type="email"
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
          <section className={panel}>
            <h2 className="mb-3 font-semibold">Sent invitations</h2>
            {!invites.length && (
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
          <section className={panel}>
            <h2 className="mb-3 font-semibold">Friends</h2>
            {friends.length ? (
              friends.map((friend) => (
                <p key={friend.id} className="mb-2 break-words text-sm">
                  {friend.name}
                </p>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Accepted friends appear here.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};
