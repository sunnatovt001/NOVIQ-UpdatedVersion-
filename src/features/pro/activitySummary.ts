import {recordDate} from '@/src/lib/recordDate';

export type ActivityRecord = {id?:string;userId?:string;duration?:unknown;timestamp?:unknown;status?:unknown;category?:unknown;subject?:string};
export const activityDay = (time:number,timezone='Asia/Tashkent') => new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
export function actualSessions<T extends ActivityRecord>(records:T[],uid:string,now=Date.now()):T[] {
  const unique=new Map<string,T>();
  for(const record of records){
    const duration=Number(record.duration),stamp=recordDate(record.timestamp)?.getTime();
    if(!record.id || record.userId && record.userId!==uid || !Number.isFinite(duration) || duration<=0 || stamp===undefined || stamp>now || ['inProgress','in_progress','pending','cancelled','failed','break'].includes(String(record.status)) || record.category==='break')continue;
    unique.set(record.id,record);
  }
  return [...unique.values()];
}
export function actualDuration(seconds:number,locale='en') {
  const safe=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
  const units=locale==='uz'?['soat','daq','son']:locale==='ru'?['ч','мин','с']:['h','min','s'];
  if(safe<60)return `${safe} ${units[2]}`;
  const minutes=Math.floor(safe/60),hours=Math.floor(minutes/60);
  return hours?`${hours} ${units[0]}${minutes%60?` ${minutes%60} ${units[1]}`:''}`:`${minutes} ${units[1]}`;
}
