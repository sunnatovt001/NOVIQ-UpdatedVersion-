// Ordinary localhost development only. Reads the authenticated user's existing
// protected subscription; it cannot create trials, mutate billing or grant access.
const { membership } = require('../functions/membership');
const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
function decodeValue(value) {
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('integerValue' in value || 'doubleValue' in value) return Number(value.integerValue ?? value.doubleValue);
  return value.stringValue ?? value.timestampValue ?? value.booleanValue ?? null;
}
const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,decodeValue(value)]));
module.exports = function localMembership({ firebaseConfig, fetchImpl = fetch, now = Date.now }) {
  return async (req,res,next) => {
    if (req.url !== '/__local-membership') return next();
    const send = (status,body) => { res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body)); };
    let origin;
    try { origin = new URL(req.headers.origin); } catch { return send(403,{error:'permission-denied'}); }
    if (!loopback(req.socket.remoteAddress) || !['localhost','127.0.0.1','[::1]'].includes(origin.hostname) || origin.host !== req.headers.host || req.method !== 'POST' || !String(req.headers['content-type']||'').startsWith('application/json')) return send(403,{error:'permission-denied'});
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
    if (!token) return send(401,{error:'unauthenticated'});
    try {
      let bytes=0;
      for await (const chunk of req) { bytes+=chunk.length;if(bytes>4096)return send(413,{error:'invalid-argument'}); }
      const auth = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(8000)});
      const account = await auth.json();
      const identity = account.users?.[0];
      if (!auth.ok || !identity?.localId || identity.disabled) return send(401,{error:'unauthenticated'});
      const uid = encodeURIComponent(identity.localId);
      const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents/users/${uid}`;
      const read = url => fetchImpl(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
      const profileResponse = await read(base);
      if (!profileResponse.ok) return send(profileResponse.status===403?403:profileResponse.status===404?409:503,{error:profileResponse.status===403?'permission-denied':profileResponse.status===404?'failed-precondition':'unavailable'});
      const profile = decodeFields((await profileResponse.json()).fields || {});
      const status = membership(profile.subscription,now());
      // Optional quota availability must not prevent subscription verification.
      let usage;
      try {
        const response=await read(base+'/trusted/aiUsage');
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
        if(response.ok){const recorded=decodeFields((await response.json()).fields||{});usage=recorded.dayKey===today?{dayKey:today,total:Number(recorded.total)||0,counts:recorded.counts||{}}:{dayKey:today,total:0,counts:{}};}
        else if(response.status===404)usage={dayKey:today,total:0,counts:{}};
      } catch { /* Unknown usage remains unknown, not a fabricated zero. */ }
      return send(200,{...status,...(usage?{usage}:{}),billing:{recurring:false,providersConfigured:false},verificationSource:'authenticated-local-server',configVersion:require('../functions/pro-config.json').version});
    } catch { return send(503,{error:'unavailable'}); }
  };
};
