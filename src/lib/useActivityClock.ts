import {useEffect,useState} from 'react';

// Refresh day-dependent views even when there are no new Firestore snapshots.
export function useActivityClock() {
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    const update=()=>setNow(Date.now());
    const timer=window.setInterval(update,30000);
    window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[]);
  return now;
}
