import { useMemo, useSyncExternalStore } from 'react';
import { doc, onSnapshot } from '@/src/lib/dataStore';
import { useAuth } from '@/src/contexts/AuthContext';
import { db } from '@/src/lib/firebase';
import { levelProgress } from '@/src/lib/levels';

export type AchievementState = { unlockedAt: string; tier: string; xp: number };
type ProgressSnapshot = {progress:VerifiedProgress|null;status:'loading'|'ready'|'unavailable'};
export type VerifiedProgress = { xp?: number; counters?: Record<string,number>; achievements?: Record<string,AchievementState> };

// Mobile/desktop headers and the badge gallery share one live subscription.
function createStore(uid:string) {
  let snapshot:ProgressSnapshot={progress:null,status:'loading'},stop:(()=>void)|undefined;
  const listeners=new Set<()=>void>();
  const connect=()=>{
    stop?.();
    stop=onSnapshot(doc(db,'users',uid,'trusted','progress'),record=>{
      snapshot={progress:record.exists()?record.data():null,status:'ready'};
      listeners.forEach(notify=>notify());
    },()=>{snapshot={...snapshot,status:'unavailable'};listeners.forEach(notify=>notify());});
  };
  return {
    getSnapshot:()=>snapshot,
    subscribe:(notify:()=>void)=>{
      listeners.add(notify);
      if(listeners.size===1){connect();window.addEventListener('online',connect);}
      return ()=>{
        listeners.delete(notify);
        if(!listeners.size){stop?.();stop=undefined;window.removeEventListener('online',connect);queueMicrotask(()=>{if(!listeners.size)stores.delete(uid);});}
      };
    },
  };
}
const stores=new Map<string,ReturnType<typeof createStore>>();
const emptySnapshot:ProgressSnapshot={progress:null,status:'loading'};
const emptyStore={getSnapshot:()=>emptySnapshot,subscribe:(_:()=>void)=>()=>{}};
const serverSnapshot=()=>emptySnapshot;
export function useXpSummary() {
  const {user,profile}=useAuth();
  const store=useMemo(()=>{
    if(!user)return emptyStore;
    if(!stores.has(user.uid))stores.set(user.uid,createStore(user.uid));
    return stores.get(user.uid)!;
  },[user?.uid]);
  const {progress,status}=useSyncExternalStore(store.subscribe,store.getSnapshot,serverSnapshot);
  return {user,profile,progress,status,info:levelProgress(progress?.xp??profile?.xp??0)};
}
