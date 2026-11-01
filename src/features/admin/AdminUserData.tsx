import {useEffect,useRef,useState} from 'react';
import {httpsCallable} from '@/src/lib/callable';
import {functions} from '@/src/lib/firebase';
import {Section} from './AdminUi';

const sections = {
  profile:'Full profile & settings',planner:'Study plans',plannerHistory:'Plan history',
  tutorMessages:'Tutor conversations',notebookNotes:'Notebook notes',notebookSources:'Notebook sources',notebookMessages:'Notebook conversations',
  decks:'Flashcard decks',cards:'Deck cards',reviews:'Card reviews',flashcardSessions:'Flashcard sessions',journals:'Journals',roadmapTasks:'Roadmap tasks',
  studySessions:'Study sessions',progressEvents:'Progress events',xpDays:'Daily XP',recallEvidence:'Recall evidence',trusted:'Verified activity & AI usage',
  subscriptionRequests:'Subscription requests',subscriptionCheckouts:'Payment records',proEvents:'Pro activity',proExperience:'Pro preferences',proReflections:'Reflections',
  joinedCommunities:'Group memberships',friends:'Friends',friendInvites:'Friend invitations',notifications:'Notifications',
};
type Result = {records:{id:string;data:Record<string,unknown>}[];nextCursor:string|null};
export function AdminUserData({userId}:{userId:string}) {
  const [section,setSection]=useState('profile'),[deckId,setDeckId]=useState('');
  const [result,setResult]=useState<Result>({records:[],nextCursor:null}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const serial=useRef(0);
  const needsDeck=section==='cards'||section==='reviews';
  async function load(after?:string) {
    const id=++serial.current;setBusy(true);setError('');
    try {
      const response=await httpsCallable<unknown,Result>(functions,'adminGetUserData')({userId,section,deckId,...(after?{after}:{})});
      if(id!==serial.current)return;
      setResult(old=>({records:after?[...old.records,...response.data.records]:response.data.records,nextCursor:response.data.nextCursor}));
    } catch {if(id===serial.current)setError('Could not load user records. Retry this section.');}
    finally {if(id===serial.current)setBusy(false);}
  }
  useEffect(()=>{
    setResult({records:[],nextCursor:null});setError('');setBusy(false);
    if(!needsDeck||deckId)void load();
    return()=>{serial.current++;};
  },[userId,section,deckId]);
  const actionClass='admin-secondary-button rounded-xl border px-4 py-3 text-sm font-semibold';
  return <Section title="User records" eyebrow="Admin access">
    <p className="mb-4 text-sm text-[var(--admin-muted)]">Browse this account’s stored application records. Each section loads separately; load more to view older records. Passwords, credentials and access tokens are hidden.</p>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="grid gap-2 text-sm"><label htmlFor="admin-user-data-section">Data section</label>
        <select id="admin-user-data-section" className={actionClass} value={section} onChange={e=>setSection(e.target.value)}>
          {Object.entries(sections).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      {needsDeck&&<label className="grid gap-2 text-sm">Deck ID
        <input className={actionClass} value={deckId} onChange={e=>setDeckId(e.target.value)} placeholder="Choose a deck from Flashcard decks"/>
      </label>}
      <button className={actionClass} type="button" disabled={busy||(needsDeck&&!deckId)} onClick={()=>void load()}>Refresh records</button>
    </div>
    <div aria-live="polite" className="mb-3 text-sm text-[var(--admin-muted)]">{busy?'Loading records…':`${result.records.length} records loaded`}</div>
    {error&&<p role="alert" className="mb-3 text-sm">{error} <button className={actionClass} type="button" disabled={busy} onClick={()=>void load(result.nextCursor||undefined)}>Retry</button></p>}
    {!busy&&!error&&!result.records.length&&<p className="text-sm text-[var(--admin-muted)]">{needsDeck&&!deckId?'Select Flashcard decks and open a deck’s cards or reviews.':'No records stored in this section.'}</p>}
    <div className="grid min-w-0 gap-3">{result.records.map(record=><details key={record.id} className="admin-soft-surface min-w-0 rounded-xl border p-3" open={section==='profile'}>
      <summary className="cursor-pointer break-all text-sm font-semibold">{String(record.data.title||record.data.name||record.id)}</summary>
      {section==='decks'&&<div className="mt-3 flex flex-wrap gap-2">{['cards','reviews'].map(kind=><button key={kind} type="button" className={actionClass} onClick={()=>{setDeckId(record.id);setSection(kind);}}>View {kind}</button>)}</div>}
      <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--admin-heading)]">{JSON.stringify(record.data,null,2)}</pre>
    </details>)}</div>
    {result.nextCursor&&<button className={`${actionClass} mt-4`} type="button" disabled={busy} onClick={()=>void load(result.nextCursor!)}>Load more records</button>}
  </Section>;
}
