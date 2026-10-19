import {useEffect,useState} from 'react';
import {collection,onSnapshot,orderBy,query,limit} from 'firebase/firestore';
import {db} from '@/src/lib/firebase';
import {recordDate} from '@/src/lib/recordDate';
import {loadLocalDataStrict} from '@/src/lib/localStore';
import {actualSessions} from './activitySummary';

export type StudyEvidence={id:string;userId:string;duration:number;timestamp:string;category:string;subject:string;status?:string;xpEarned:number;origin?:string};
export function useStudyEvidence(uid?:string,count=300){
  const [revision,setRevision]=useState(0);
  const [state,setState]=useState<{uid?:string;records:StudyEvidence[];ready:boolean;error:boolean;deviceSeconds:number}>({records:[],ready:false,error:false,deviceSeconds:0});
  useEffect(()=>{
    if(!uid){setState({records:[],ready:false,error:false,deviceSeconds:0});return;}
    let active=true,cloud:StudyEvidence[]=[],ready=false,failed=false;
    const publish=()=>{
      if(!active)return;
      let device:StudyEvidence[]=[];
      try{
        const saved=loadLocalDataStrict<any[]>(`noviq-focus-history-${uid}`,[]);
        if(!Array.isArray(saved))throw new Error('Invalid history');
        // Untagged legacy cache entries may duplicate cloud records. Preserve
        // them in storage, but do not silently credit unverifiable duplicates.
        device=saved.filter(row=>row?.origin==='device').map(row=>({...row,userId:uid,category:'focus',subject:row.subject||'Focus',xpEarned:0}));
      }catch{failed=true;}
      const records=actualSessions([...device,...cloud],uid).map(row=>({...row,timestamp:recordDate(row.timestamp)!.toISOString(),duration:Number(row.duration)}));
      setState({uid,records,ready,error:failed,deviceSeconds:records.filter(row=>row.origin==='device').reduce((sum,row)=>sum+row.duration,0)});
    };
    setState({uid,records:[],ready:false,error:false,deviceSeconds:0});
    const deadline=window.setTimeout(()=>{if(!ready){ready=true;failed=true;publish();}},15000);
    const stop=onSnapshot(query(collection(db,'users',uid,'studySessions'),orderBy('timestamp','desc'),limit(count)),{includeMetadataChanges:true},snapshot=>{
      cloud=snapshot.docs.map(doc=>({...doc.data(),id:doc.id,userId:doc.data().userId||uid} as StudyEvidence));ready=!snapshot.metadata?.fromCache;failed=false;publish();
    },()=>{ready=true;failed=true;publish();});
    const update=()=>publish();window.addEventListener('noviq:focus-history',update);window.addEventListener('storage',update);
    return()=>{active=false;window.clearTimeout(deadline);stop();window.removeEventListener('noviq:focus-history',update);window.removeEventListener('storage',update);};
  },[uid,count,revision]);
  return {...(state.uid===uid?state:{records:[],ready:false,error:false,deviceSeconds:0}),retry:()=>setRevision(value=>value+1)};
}
