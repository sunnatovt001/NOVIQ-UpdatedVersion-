const { randomBytes } = require("node:crypto");
module.exports = ({ db, onCall, HttpsError, FieldValue }) => {
  const api = {};
  const auth = (request) => {
    if (!request.auth?.uid)
      throw new HttpsError("unauthenticated", "Sign in first.");
    return request.auth.uid;
  };
  const text = (value, max, label) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max)
      throw new HttpsError(
        "invalid-argument",
        `${label} is required (maximum ${max} characters).`,
      );
    return value.trim();
  };
  const roomId = (request) => {
    const id = text(request.data?.communityId, 128, "Group");
    if (!/^[a-zA-Z0-9_-]+$/.test(id))
      throw new HttpsError("invalid-argument", "Invalid group.");
    return id;
  };
  const rate = async (tx, uid, type, max) => {
    const ref = db.doc(`users/${uid}/trusted/${type}Rate`);
    const snap = await tx.get(ref);
    const prior = snap.data() || {};
    const window = Math.floor(Date.now() / 60000);
    const count = prior.window === window ? Number(prior.count) || 0 : 0;
    if (count >= max)
      throw new HttpsError(
        "resource-exhausted",
        "Too many requests. Please wait a minute and retry.",
      );
    return () => tx.set(ref, { window, count: count + 1 });
  };
  api.createCommunity = onCall(async (request) => {
    const uid = auth(request);
    const name = text(request.data?.name, 80, "Group name");
    const description = String(request.data?.description || "").trim();
    if (description.length > 500)
      throw new HttpsError("invalid-argument", "Description is too long.");
    const id = randomBytes(16).toString("hex");
    await db.runTransaction(async (tx) => {
      const profile = await tx.get(db.doc(`users/${uid}`));
      const consume = await rate(tx, uid, "communityCreate", 3);
      if (!profile.exists)
        throw new HttpsError(
          "failed-precondition",
          "Create your profile first.",
        );
      const now = new Date().toISOString();
      consume();
      tx.create(db.doc(`communities/${id}`), {
        name,
        description,
        isPublic: true,
        membersCount: 1,
        createdBy: uid,
        createdAt: now,
      });
      tx.create(db.doc(`communities/${id}/members/${uid}`), {
        uid,
        displayName: profile.data().displayName || "Noviq student",
        role: "owner",
        joinedAt: now,
      });
      tx.set(db.doc(`users/${uid}/joinedCommunities/${id}`), {
        name,
        role: "owner",
        joinedAt: now,
      });
    });
    return { communityId: id };
  });
  api.getCommunityMemberCount = onCall(async (request) => {
    const uid = auth(request), id = roomId(request);
    const member = await db.doc(`communities/${id}/members/${uid}`).get();
    if (!member.exists) throw new HttpsError("permission-denied", "Join this group before viewing its members.");
    const authorIds = request.data?.authorIds ?? [];
    if (!Array.isArray(authorIds) || authorIds.length > 10 || authorIds.some((value) => typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))) throw new HttpsError("invalid-argument", "Invalid message authors.");
    const result = await db.collection(`communities/${id}/members`).count().get();
    const authors = Object.create(null);
    await Promise.all([...new Set(authorIds)].map(async (authorId) => {
      const messages = await db.collection(`communities/${id}/messages`).where("userId", "==", authorId).limit(1).get();
      if (messages.empty) { authors[authorId] = null; return; }
      const profile = await db.doc(`users/${authorId}`).get();
      const name = profile.exists ? profile.data().displayName || profile.data().name : null;
      authors[authorId] = typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : null;
    }));
    return { count: result.data().count, authors };
  });
  api.joinCommunity = onCall(async (request) => {
    const uid = auth(request),
      id = roomId(request);
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`communities/${id}`),
        memberRef = db.doc(`communities/${id}/members/${uid}`),
        joinedRef = db.doc(`users/${uid}/joinedCommunities/${id}`);
      const [room, member, profile, existingJoin] = await Promise.all([
        tx.get(ref),
        tx.get(memberRef),
        tx.get(db.doc(`users/${uid}`)),
        tx.get(joinedRef),
      ]);
      if (
        !room.exists ||
        (!room.data().isPublic &&
          room.data().createdBy !== uid &&
          !member.exists &&
          !existingJoin.exists)
      )
        throw new HttpsError("permission-denied", "This group is unavailable.");
      if (!profile.exists)
        throw new HttpsError(
          "failed-precondition",
          "Create your profile first.",
        );
      const consume = await rate(tx, uid, "communityJoin", 20);
      const role =
        room.data().createdBy === uid || existingJoin.data()?.role === "owner"
          ? "owner"
          : "member";
      const joinedAt =
        member.data()?.joinedAt ||
        existingJoin.data()?.joinedAt ||
        new Date().toISOString();
      consume();
      tx.set(memberRef, {
        uid,
        displayName: profile.data().displayName || "Noviq student",
        role,
        joinedAt,
      }, { merge: true });
      tx.set(joinedRef, {
        name: room.data().name,
        role,
        joinedAt: existingJoin.data()?.joinedAt || joinedAt,
      }, { merge: true });
      if (!member.exists)
        tx.update(ref, {
          membersCount: (Number(room.data().membersCount) || 0) + 1,
        });
    });
    return { communityId: id };
  });
  api.leaveCommunity = onCall(async (request) => {
    const uid = auth(request),
      id = roomId(request);
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`communities/${id}`),
        memberRef = db.doc(`communities/${id}/members/${uid}`);
      const [room, member] = await Promise.all([
        tx.get(ref),
        tx.get(memberRef),
      ]);
      if (room.data()?.createdBy === uid)
        throw new HttpsError(
          "failed-precondition",
          "The group owner must remain in the group.",
        );
      tx.delete(memberRef);
      tx.delete(db.doc(`users/${uid}/joinedCommunities/${id}`));
      if (room.exists && member.exists)
        tx.update(ref, {
          membersCount: Math.max(
            0,
            (Number(room.data().membersCount) || 0) - 1,
          ),
        });
    });
    return { communityId: id };
  });
  api.sendCommunityMessage = onCall(async (request) => {
    const uid = auth(request),
      id = roomId(request);
    const content = text(request.data?.content, 2000, "Message");
    const messageId = text(request.data?.messageId, 64, "Message ID");
    if (!/^[a-zA-Z0-9_-]+$/.test(messageId))
      throw new HttpsError("invalid-argument", "Invalid message ID.");
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`communities/${id}/messages/${messageId}`);
      const [member, message] = await Promise.all([
        tx.get(db.doc(`communities/${id}/members/${uid}`)),
        tx.get(ref),
      ]);
      if (!member.exists)
        throw new HttpsError(
          "permission-denied",
          "Join this group before sending messages.",
        );
      if (message.exists) {
        if (message.data().userId !== uid || message.data().content !== content)
          throw new HttpsError("already-exists", "Message ID already used.");
        return;
      }
      const consume = await rate(tx, uid, "communityMessage", 30);
      consume();
      tx.create(ref, {
        userId: uid,
        displayName: member.data().displayName || "Noviq student",
        content,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { messageId };
  });
  api.createFriendInvite = onCall(async (request) => {
    const uid = auth(request),
      email = text(request.data?.email, 254, "Email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new HttpsError("invalid-argument", "Enter a valid email address.");
    if (email === String(request.auth.token?.email || "").toLowerCase())
      throw new HttpsError(
        "invalid-argument",
        "Choose a friend’s email, rather than your own.",
      );
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await db.runTransaction(async (tx) => {
      const profile = await tx.get(db.doc(`users/${uid}`));
      const consume = await rate(tx, uid, "friendInvite", 5);
      if (!profile.exists)
        throw new HttpsError(
          "failed-precondition",
          "Create your profile first.",
        );
      const data = {
        senderId: uid,
        senderName: profile.data().displayName || "Noviq student",
        senderEmail: request.auth.token?.email || "",
        email,
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt,
      };
      consume();
      tx.create(db.doc(`friendInvitations/${token}`), data);
      tx.create(db.doc(`users/${uid}/friendInvites/${token}`), {
        ...data,
        direction: "outgoing",
        token,
      });
    });
    return { token, expiresAt };
  });
  const invitation = async (request, tx) => {
    const uid = auth(request),
      token = request.data?.token;
    if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token))
      throw new HttpsError(
        "invalid-argument",
        "This invitation link is invalid.",
      );
    const ref = db.doc(`friendInvitations/${token}`);
    const snap = await (tx ? tx.get(ref) : ref.get());
    const data = snap.data();
    if (
      !snap.exists ||
      data.email !== String(request.auth.token?.email || "").toLowerCase() ||
      data.senderId === uid
    )
      throw new HttpsError(
        "permission-denied",
        "Sign in with the email address this invitation was sent to.",
      );
    if (Date.parse(data.expiresAt) <= Date.now())
      throw new HttpsError(
        "deadline-exceeded",
        "This invitation has expired. Ask your friend for a new link.",
      );
    return { ref, data, uid, token };
  };
  api.getFriendInvite = onCall(async (request) => {
    const { data } = await invitation(request);
    return { senderName: data.senderName, status: data.status };
  });
  api.acceptFriendInvite = onCall(async (request) => {
    return db.runTransaction(async (tx) => {
      const { ref, data, uid, token } = await invitation(request, tx);
      if (!request.auth.token?.email_verified)
        throw new HttpsError(
          "failed-precondition",
          "Verify your email first, then refresh your sign-in and try again.",
        );
      if (data.status === "accepted" && data.acceptedBy === uid)
        return { accepted: true };
      if (data.status !== "pending")
        throw new HttpsError(
          "failed-precondition",
          "This invitation is no longer available.",
        );
      const [recipient, sender] = await Promise.all([
        tx.get(db.doc(`users/${uid}`)),
        tx.get(db.doc(`users/${data.senderId}`)),
      ]);
      if (!recipient.exists || !sender.exists)
        throw new HttpsError(
          "failed-precondition",
          "Both accounts must have profiles.",
        );
      const createdAt = new Date().toISOString();
      tx.update(ref, {
        status: "accepted",
        acceptedBy: uid,
        acceptedAt: createdAt,
      });
      tx.update(db.doc(`users/${data.senderId}/friendInvites/${token}`), {
        status: "accepted",
        acceptedAt: createdAt,
      });
      tx.set(db.doc(`users/${uid}/friends/${data.senderId}`), {
        uid: data.senderId,
        displayName: sender.data().displayName || data.senderName,
        email: data.senderEmail,
        createdAt,
      });
      tx.set(db.doc(`users/${data.senderId}/friends/${uid}`), {
        uid,
        displayName: recipient.data().displayName || "Noviq student",
        email: data.email,
        createdAt,
      });
      return { accepted: true };
    });
  });
  return api;
};
