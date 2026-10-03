const { before, after, test } = require("node:test");
const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { doc, setDoc, updateDoc, getDoc } = require("firebase/firestore");
let environment;
let owner;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-noviq",
    firestore: {
      host: "127.0.0.1",
      port: 8089,
      rules: fs.readFileSync(`${__dirname}/../firestore.rules`, "utf8"),
    },
  });
  owner = environment.authenticatedContext("u1").firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    // Legacy profile deliberately lacks optional isAdmin/usage/subscription.
    await setDoc(doc(context.firestore(), "users/u1"), {
      uid: "u1",
      email: "u1@example.com",
      xp: 0,
      onboarded: false,
    });
  });
});
after(async () => environment?.cleanup());
test("legacy profiles can update allowed fields", async () => {
  await assertSucceeds(
    updateDoc(doc(owner, "users/u1"), {
      displayName: "Student",
      onboarded: true,
    }),
  );
});
test("protected fields cannot be added or modified", async () => {
  for (const patch of [
    { isAdmin: true },
    { xp: 9999 },
    { subscription: { plan: "pro" } },
    { telegramId: "123456" },
    { usage: { aiTutor: {} } },
  ]) {
    await assertFails(updateDoc(doc(owner, "users/u1"), patch));
  }
});
test("private profiles are isolated between accounts", async () => {
  await assertSucceeds(getDoc(doc(owner, "users/u1")));
  await assertFails(
    getDoc(doc(environment.authenticatedContext("u2").firestore(), "users/u1")),
  );
});
test("clients cannot create verified sessions, checkouts or trusted state", async () => {
  for (const path of [
    "users/u1/studySessions/s1",
    "users/u1/subscriptionCheckouts/c1",
    "users/u1/trusted/aiUsage",
    "telegramLinks/abc",
    "verifiedPayments/tx1",
  ]) {
    await assertFails(
      setDoc(doc(owner, path), { status: "pending", verified: true }),
    );
  }
});
test("progress events reject forged completion metadata and noncanonical session IDs", async () => {
  const data = {
    type: "study_session",
    sessionId: "s1",
    createdAt: new Date().toISOString(),
  };
  await assertFails(setDoc(doc(owner, "users/u1/progressEvents/random"), data));
  await assertFails(
    setDoc(doc(owner, "users/u1/progressEvents/session-s1"), {
      ...data,
      processedAt: new Date().toISOString(),
    }),
  );
  await assertSucceeds(
    setDoc(doc(owner, "users/u1/progressEvents/session-s1"), data),
  );
});
test("analytics cannot forge processed markers or impersonate another account", async () => {
  const data = {
    userId: "u1",
    eventType: "site_visit",
    createdAt: new Date().toISOString(),
  };
  await assertFails(
    setDoc(doc(owner, "analyticsEvents/fake1"), {
      ...data,
      processedAt: "now",
    }),
  );
  await assertFails(
    setDoc(doc(owner, "analyticsEvents/fake2"), { ...data, userId: "u2" }),
  );
  await assertSucceeds(setDoc(doc(owner, "analyticsEvents/valid"), data));
});
test("owner notes and pending cancellation requests remain writable", async () => {
  await assertSucceeds(
    setDoc(doc(owner, "users/u1/notebookNotes/n1"), { content: "Study notes" }),
  );
  await assertSucceeds(
    setDoc(doc(owner, "users/u1/subscriptionRequests/r1"), {
      action: "cancel_renewal",
      status: "pending",
      createdAt: new Date().toISOString(),
      syncStatus: "synced",
    }),
  );
});

test("community friendships, memberships and chat cannot be forged by clients", async () => {
  for (const path of [
    "users/u1/friends/u2",
    "users/u1/friendInvites/token",
    "users/u1/joinedCommunities/room",
    "communities/room",
    "communities/room/members/u1",
    "communities/room/messages/fake",
    "friendInvitations/token",
  ])
    await assertFails(
      setDoc(doc(owner, path), {
        uid: "u1",
        createdBy: "u1",
        role: "owner",
        content: "fake",
      }),
    );
});
test("community messages are readable only by group members", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "communities/room/members/u1"), {
      uid: "u1",
    });
    await setDoc(doc(context.firestore(), "communities/room/messages/real"), {
      content: "Hello",
      userId: "u1",
    });
  });
  await assertSucceeds(getDoc(doc(owner, "communities/room/messages/real")));
  await assertFails(
    getDoc(
      doc(
        environment.authenticatedContext("u2").firestore(),
        "communities/room/messages/real",
      ),
    ),
  );
});
