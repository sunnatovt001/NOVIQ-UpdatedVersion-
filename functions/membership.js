const config = require('./pro-config.json');
const millis = value => typeof value === 'number' ? value : Date.parse(value || '');
function membership(subscription, now = Date.now()) {
  const s = subscription || {};
  const trial = s.status === 'trialing';
  const end = millis(trial ? s.trialEndsAt || s.currentPeriodEnd : s.currentPeriodEnd);
  const entitled = s.plan === 'pro' && ['active', 'trialing'].includes(s.status) && end > now;
  const state = entitled ? trial ? 'PRO_TRIAL' : s.cancelAtPeriodEnd ? 'PRO_CANCEL_SCHEDULED' : 'PRO_ACTIVE' : s.status === 'past_due' ? 'PRO_PAST_DUE' : s.plan === 'pro' || s.trialStartedAt || s.status === 'expired' ? 'PRO_EXPIRED' : 'FREE';
  return { state, entitled, trialEligible: config.features.trial && !s.trialStartedAt && !s.trialUsed && s.plan !== 'pro', trialStartedAt: s.trialStartedAt || null, trialEndsAt: s.trialEndsAt || (trial ? s.currentPeriodEnd : null) || null, currentPeriodEnd: s.currentPeriodEnd || null, serverNow: now, quotas: config.quotas[entitled ? 'pro' : 'free'], features: config.features };
}
function trialSubscription(previous, now = Date.now()) {
  if (!config.features.trial || !membership(previous, now).trialEligible) throw new Error('TRIAL_UNAVAILABLE');
  const started = new Date(now).toISOString(), end = new Date(now + config.trialDays * 86400000).toISOString();
  return { ...(previous || {}), plan: 'pro', status: 'trialing', trialUsed: true, trialStartedAt: started, trialEndsAt: end, startedAt: started, currentPeriodEnd: end, cancelAtPeriodEnd: false, autoRenew: false };
}
function registerMembership({exports, db, onCall, onSchedule, HttpsError, FieldValue}) {
  const uidOf = request => { if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.'); return request.auth.uid; };
  const event = (uid, id) => db.doc(`users/${uid}/proEvents/${id}`);
  exports.getMembershipStatus = onCall(async request => {
    const uid = uidOf(request), user = await db.doc(`users/${uid}`).get();
    if (!user.exists) throw new HttpsError('failed-precondition', 'Create your profile first.');
    const usage = await db.doc(`users/${uid}/trusted/aiUsage`).get();
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const recorded = usage.data();
    const visibleUsage = recorded?.dayKey===today ? {dayKey:today,total:Number(recorded.total)||0,counts:recorded.counts||{}} : {dayKey:today,total:0,counts:{}};
    return {...membership(user.data().subscription), usage: visibleUsage, billing: {recurring: false, providersConfigured: !!(process.env.PAYMENT_CHECKOUT_URL && process.env.PAYMENT_CHECKOUT_SECRET)}, configVersion: config.version};
  });
  exports.startProTrial = onCall(async request => {
    const uid = uidOf(request);
    if (request.data?.acceptTerms !== true) throw new HttpsError('invalid-argument', 'Explicit trial agreement is required.');
    return db.runTransaction(async tx => {
      const ref = db.doc(`users/${uid}`), snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('failed-precondition', 'Create your profile first.');
      const before = snap.data().subscription;
      // Duplicate requests during the same trial return the original timestamps.
      if (membership(before).state === 'PRO_TRIAL') return {...membership(before), subscription: before};
      let subscription;
      try { subscription = trialSubscription(before); } catch { throw new HttpsError('already-exists', 'This account has already used its trial or has PRO access.'); }
      tx.set(ref, {subscription, updatedAt: FieldValue.serverTimestamp()}, {merge:true});
      tx.set(event(uid,'trial_started'), {type:'trial_started', at:subscription.trialStartedAt});
      return {...membership(subscription), subscription};
    });
  });
  exports.cancelProRenewal = onCall(async request => {
    const uid = uidOf(request);
    return db.runTransaction(async tx => {
      const ref = db.doc(`users/${uid}`), snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Profile not found.');
      const s = snap.data().subscription || {};
      if (!membership(s).entitled) return membership(s);
      tx.set(ref, {subscription:{...s, cancelAtPeriodEnd:true, autoRenew:false, cancelRequestedAt:new Date().toISOString()}}, {merge:true});
      tx.set(event(uid,'subscription_cancelled'), {type:'subscription_cancelled', at:new Date().toISOString()});
      return membership({...s,cancelAtPeriodEnd:true});
    });
  });
  // Timestamp checks on every premium API enforce expiry even if this job is delayed.
  // Paginate the expiry-indexed query; each user is rechecked within a transaction.
  exports.reconcileProMemberships = onSchedule({schedule:'every 60 minutes', timeZone:'UTC'}, async () => {
    const now = Date.now(), soon = new Date(now + 86400000).toISOString();
    let cursor;
    for (let page=0; page<20; page++) {
      let query = db.collection('users').where('subscription.status','in',['active','trialing']).where('subscription.currentPeriodEnd','<=',soon).orderBy('subscription.currentPeriodEnd').limit(250);
      if (cursor) query = query.startAfter(cursor);
      const batch = await query.get();
      if (!batch.docs.length) break;
      for (const doc of batch.docs) await db.runTransaction(async tx => {
        const current = await tx.get(doc.ref), s = current.data()?.subscription;
        if (!s || !['trialing','active'].includes(s.status)) return;
        const end = millis(s.currentPeriodEnd);
        const expiring = end > now && end <= now+86400000;
        const id = end<=now ? `expired-${s.currentPeriodEnd.slice(0,10)}` : `trial-reminder-${s.trialStartedAt?.slice(0,10)}`;
        const notification = db.doc(`users/${doc.id}/notifications/pro-${id}`);
        const existing = await tx.get(notification);
        if (end <= now) {
          tx.set(doc.ref, {subscription:{...s,status:'expired',autoRenew:false},updatedAt:FieldValue.serverTimestamp()}, {merge:true});
          tx.set(event(doc.id,'trial_expired-'+s.currentPeriodEnd.slice(0,10)), {type:s.status==='trialing'?'trial_expired':'subscription_expired',at:new Date(now).toISOString()});
        }
        if (!existing.exists && (end<=now || expiring && s.status==='trialing')) tx.set(notification, {type:'system', title:end<=now?'NOVIQ PRO expired':'Your PRO trial ends soon', body:end<=now?'Your study content is saved. Continue with Free or view membership options.':`Your trial ends ${s.currentPeriodEnd}. No automatic charge.`, titleKey:end<=now?'pro.expired':'pro.reminder', link:'#/pricing', read:false, createdAt:FieldValue.serverTimestamp()});
      });
      cursor = batch.docs.at(-1);
      if (batch.docs.length<250) break;
    }
  });
}
module.exports = {membership,trialSubscription,registerMembership};
