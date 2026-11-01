// Read-only application records. Authentication stores are intentionally outside
// this API; callers cannot supply arbitrary database paths or collection names.
const collections = ['planner','plannerHistory','tutorMessages','notebookNotes','notebookSources','notebookMessages','decks','flashcardSessions','journals','roadmapTasks','studySessions','progressEvents','xpDays','recallEvidence','trusted','subscriptionRequests','subscriptionCheckouts','proEvents','proExperience','proReflections','joinedCommunities','friends','friendInvites','notifications'];
const scrub = value => {
  if (value == null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(scrub);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
    /password|secret|token|credential|private.?key|api.?key|salt|hash/i.test(key) ? '[redacted]' : scrub(entry)]));
};
module.exports = ({db,onCall,HttpsError,assertAdmin}) => ({
  adminGetUserData: onCall(async request => {
    await assertAdmin(request);
    const {userId,section='profile',after='',deckId} = request.data || {};
    const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
    if (!validId(userId) || typeof after !== 'string' || after.length > 1500 || after.includes('/') ||
        !['profile',...collections,'cards','reviews'].includes(section))
      throw new HttpsError('invalid-argument','Invalid user data request.');
    const profile = await db.doc(`users/${userId}`).get();
    if (!profile.exists) throw new HttpsError('not-found','User not found.');
    if (section === 'profile') return {records:[{id:userId,data:scrub(profile.data())}],nextCursor:null};
    let path = `users/${userId}/${section}`;
    if (section === 'cards' || section === 'reviews') {
      if (!validId(deckId)) throw new HttpsError('invalid-argument','Select a deck.');
      path = `users/${userId}/decks/${deckId}/${section}`;
    }
    let query = db.collection(path).orderBy('__name__');
    if (after) query = query.startAfter(after);
    const snapshot = await query.limit(11).get();
    const records = [];
    let bytes = 0;
    for (const doc of snapshot.docs.slice(0,10)) {
      const record = {id:doc.id,data:scrub(doc.data())};
      const size = Buffer.byteLength(JSON.stringify(record));
      if (records.length && bytes + size > 2 * 1024 * 1024) break;
      records.push(record);bytes += size;
    }
    return {records,nextCursor:snapshot.docs.length>records.length?records.at(-1)?.id||null:null};
  }),
});
