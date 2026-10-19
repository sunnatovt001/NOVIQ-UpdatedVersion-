const fs=require('node:fs');
let file='src/pages/Analytics.tsx',code=fs.readFileSync(file,'utf8');
code=code.replace("import {ReferenceActivityRail}","import {useStudyEvidence} from '@/src/features/pro/useStudyEvidence';\nimport {activityDay,actualDuration} from '@/src/features/pro/activitySummary';\nimport {ReferenceActivityRail}");
const start=code.indexOf('  const [studySessions, setStudySessions]');
const end=code.indexOf('  const dailyTargetMinutes',start);
if(start<0||end<0)throw new Error('Analytics integration boundary missing');
code=code.slice(0,start)+`  const evidence=useStudyEvidence(user?.uid,300);
  const studySessions=evidence.records;
  const sessionError=evidence.error?copy.historyError:'';
  const sessionLoading=!evidence.ready;
  const dataReady=evidence.ready&&!evidence.error;
`+code.slice(end);
code=code.replace('setSessionRevision((current) => current + 1);','evidence.retry();');
code=code.replace('{s.value}',"{dataReady && (s.icon===Clock || s.icon===Zap || !activityMetrics.loading&&!activityMetrics.error) ? s.value : '—'}");
code=code.replace('const minutes = Math.round(Math.max(0, seconds) / 60);','return actualDuration(seconds,locale);\n  const minutes = Math.floor(Math.max(0, seconds) / 60);');
code=code.replace('getLocalDayKey(session.timestamp)','activityDay(Date.parse(session.timestamp))').replace('getLocalDayKey(date)','activityDay(date.getTime())');
// Align calendar week boundaries with the configured study timezone rather than
// the host computer's timezone. Calendar arithmetic remains in UTC date space.
const wstart=code.indexOf('const getWeekStart =');const wend=code.indexOf('const buildWeeklyData',wstart);
code=code.slice(0,wstart)+`const getWeekStart = (weekOffset = 0) => {
  const day=new Date(activityDay(Date.now())+'T00:00:00Z');
  day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7)+weekOffset*7);
  return day;
};

`+code.slice(wend);
code=code.replace('date.setDate(weekStart.getDate() + index);','date.setUTCDate(weekStart.getUTCDate() + index);').replace('const dayKey = activityDay(date.getTime());','const dayKey = date.toISOString().slice(0,10);');
code=code.replace('const date = new Date();\n    date.setDate(date.getDate() - 34 + index);',"const date = new Date(activityDay(Date.now())+'T00:00:00Z');\n    date.setUTCDate(date.getUTCDate() - 34 + index);");
code=code.replace('const minutes = Math.round((totalsByDay.get(dayKey) || 0) / 60);','const minutes = (totalsByDay.get(dayKey) || 0) / 60;');
code=code.replace('{sessionLoading &&',"{evidence.deviceSeconds>0 && <p role=\"status\">{locale==='uz'?'Qurilmada saqlangan faoliyat ham kiritilgan.':locale==='ru'?'Включена активность, сохранённая на устройстве.':'Includes activity saved only on this device.'}</p>}\n      {sessionLoading &&");
code=code.replace('{totalXp}',"{activityMetrics.loading||activityMetrics.error?'—':totalXp}").replace('{activityMetrics.level}',"{activityMetrics.loading||activityMetrics.error?'—':activityMetrics.level}");
fs.writeFileSync(file,code);
file='src/features/pro/ReferenceOverview.tsx';code=fs.readFileSync(file,'utf8').replace('{p.progressCompleted}</dd>',"{ready ? p.progressCompleted : '—'}</dd>").replace('{p.active}</dd>',"{ready ? p.active : '—'}</dd>");fs.writeFileSync(file,code);
