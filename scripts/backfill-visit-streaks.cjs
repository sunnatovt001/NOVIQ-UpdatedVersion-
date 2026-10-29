// Conservative repair: count a historical visit only when client and server calendar days agree.
// One-time historical correction; do not reuse after analytics retention/pruning.
// Dry run by default. Usage: node scripts/backfill-visit-streaks.cjs <firebase-cli-path> [--apply]
const { argv } = process;
(async () => {
  const { db } = await require('./cloud-client.cjs')(argv[2]);
  try {
    const events = await db.collection('analyticsEvents').where('eventType', '==', 'site_visit').get();
    const evidence = new Map();
    let excluded = 0;
    const day = millis => Math.floor((millis + 18000000) / 86400000);
    for (const event of events.docs) {
      const uid = event.data().userId;
      if (typeof uid !== 'string' || uid.includes('/')) continue;
      if (!evidence.has(uid)) evidence.set(uid, new Map());
      const submittedDay = day(event.createTime.toMillis());
      const recordedAt = Date.parse(event.data().createdAt);
      if (!Number.isFinite(recordedAt) || day(recordedAt) !== submittedDay) { excluded++; continue; }
      evidence.get(uid).set(submittedDay, event.createTime);
    }
    let repaired = 0;
    const results = [];
    for (const [uid, visits] of evidence) {
      await db.runTransaction(async tx => {
        const ref = db.doc(`users/${uid}`), snapshot = await tx.get(ref);
        if (!snapshot.exists) return;
        const days = [...visits.keys()].filter(value => value <= day(Date.now())).sort((a,b) => a-b);
        let run = 0, best = 0, previous = -1;
        for (const value of days) { run = value === previous + 1 ? run + 1 : 1; best = Math.max(best, run); previous = value; }
        best = Math.max(best, run);
        const patch = {visitStreak:run,bestVisitStreak:best,lastVisitDay:previous,lastVisitAt:visits.get(previous) || null};
        if (argv.includes('--apply')) tx.update(ref, patch);
        repaired++;
        results.push({current: day(Date.now()) === previous ? run : 0,best});
      });
    }
    console.log(JSON.stringify({applied:argv.includes('--apply'),accounts:repaired,excluded,results}));
  } finally { await db.terminate(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
