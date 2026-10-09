import { auth } from "./firebase";
import { trackUserEvent } from "./analytics";
import { isReadOnlyAudit } from "./auditMode";
import { loadLocalData, trySaveLocalData } from "./localStore";

const recent = new Map<string,number>();
export const reportClientError = (source: "route" | "metrics", error: unknown) => {
  if (isReadOnlyAudit || !auth.currentUser || !navigator.onLine) return;
  const uid=auth.currentUser.uid;
  // Do not transmit messages, stacks, prompts, query strings or credentials.
  const rawCode=typeof error === "object" && error && "code" in error ? String(error.code) : "runtime";
  const code=/^[a-z/-]{1,48}$/.test(rawCode) ? rawCode : "runtime";
  const path=(window.location.hash.replace(/^#\//,"") || window.location.pathname.slice(1)).toLowerCase();
  const route=["dashboard","planner","tutor","notes","flashcards","focus","community","analytics","profile","pricing","admin"].includes(path) ? path : "unknown";
  const key=`${uid}:${source}:${route}:${code}`;
  if (Date.now()-(recent.get(key)||0)<60000) return;
  const quotaKey=`noviq:clientErrorQuota:${uid}`;
  const day=new Date().toISOString().slice(0,10);
  const quota=loadLocalData<{day:string;count:number}>(quotaKey,{day,count:0});
  const count=quota.day===day && Number.isFinite(quota.count)?quota.count:0;
  if (count>=10 || !trySaveLocalData(quotaKey,{day,count:count+1})) return;
  recent.set(key,Date.now());
  // Collection already exists and is protected by the existing analytics rules.
  // Reporting failure must not recursively report itself or block recovery UI.
  void trackUserEvent(uid,"client_error",0,{source,code,route}).catch(()=>{});
};
