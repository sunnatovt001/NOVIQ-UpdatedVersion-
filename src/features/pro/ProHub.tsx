import { ReferenceOverview } from './ReferenceOverview';
import { LiquidToday } from './LiquidToday';
import { GlassDashboard } from './GlassDashboard';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import { ArrowUpRight, Compass, Download, Orbit, Play, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { useSmartPlanner } from '@/src/features/planner/useSmartPlanner';
import { useFlashcards } from '@/src/features/flashcards/useFlashcards';
import { emptyCard, normalizeDeck } from '@/src/features/flashcards/model';
import { dateKey, localInstant, addDays } from '@/src/features/planner/smartPlannerModel';
import { writeDocWithQueue } from '@/src/lib/offlineSync';
import { trackUserEvent } from '@/src/lib/analytics';
import { membershipCall, useMembership } from './MembershipContext';
import { PremiumGate, TrialButton } from './ProMembership';
import { useProCopy } from './proCopy';
import { learningEvidence, validateDeckDraft, learningWeekStart } from './intelligence';
import './pro.css';
import {useStudyEvidence} from './useStudyEvidence';
type FocusRecord = {
    id: string;
    subject: string;
    category?: string;
    duration: number;
    timestamp: string;
};
export function ProHub({ preview = false, closePreview }: {
    preview?: boolean;
    closePreview?: () => void;
}) {
    const { user, profile } = useAuth();
    return user ? <Hub key={user.uid} uid={user.uid} preview={preview} closePreview={closePreview}/> : null;
}
function Hub({ uid, preview, closePreview }: {
    uid: string;
    preview: boolean;
    closePreview?: () => void;
}) {
    const c = useProCopy(), { locale } = useLocale(), { profile } = useAuth(), member = useMembership();
    const [destination] = useState(() => { try {
        const key = `noviq:${uid}:proDestination`, value = JSON.parse(sessionStorage.getItem(key) || 'null');
        sessionStorage.removeItem(key);
        return value;
    }
    catch {
        return null;
    } });
    const planner = useSmartPlanner(uid), flash = useFlashcards(uid), plan = planner.plan;
    const study = useStudyEvidence(uid,100);
    const [tab, setTab] = useState(['overview', 'reports', 'studio'].includes(destination?.tab) ? destination.tab : 'overview'), [feedError, setFeedError] = useState(false), [experience, setExperience] = useState<{
        step?: number;
        completed?: boolean;
    } | null>(null);
    const [tool, setTool] = useState(['coach', 'practice', 'summary', 'deck'].includes(destination?.tool) ? destination.tool : 'coach'), [source, setSource] = useState(''), [consent, setConsent] = useState(false), [output, setOutput] = useState(''), [draft, setDraft] = useState<{
        front: string;
        back: string;
    }[]>([]), [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
    const [notes, setNotes] = useState<{
        id: string;
        title: string;
        content: string;
        kind?: string;
        subjectId?: string;
        confidence?: string;
    }[]>([]), [capture, setCapture] = useState(''), [captureMode, setCaptureMode] = useState('note'), [journalTopic, setJournalTopic] = useState(''), [journalText, setJournalText] = useState(''), [journalSubject, setJournalSubject] = useState(''), [confidence, setConfidence] = useState('needs-review');
    const generation = useRef(0), active = useRef(true), pending = useRef(false);
    useEffect(() => { active.current = true; const experienceStop = onSnapshot(doc(db, 'users', uid, 'proExperience', 'onboarding'), s => setExperience(s.exists() ? s.data() : {}), () => setExperience({})); return () => { active.current = false; generation.current++; experienceStop(); }; }, [uid]);
    useEffect(() => onSnapshot(query(collection(db, 'users', uid, 'notebookNotes'), orderBy('updatedAt', 'desc'), limit(60)), snap => setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as any))), () => setFeedError(true)), [uid]);
    const cards = Object.values(flash.library.cards).flat(), e = learningEvidence(plan, cards, flash.getReview, flash.library.sessions, member.now);
    const focus = study.records.filter(record=>record.category==='focus'),focusReady=study.ready;
    const dataStatus = planner.error || flash.blocked || study.error ? 'unavailable' : !planner.known || !flash.ready || !focusReady ? 'loading' : 'ready';
    const weekFocus = focus.filter(s => Date.parse(s.timestamp) >= learningWeekStart(member.now,plan?.timezone||'Asia/Tashkent') && Date.parse(s.timestamp) <= member.now);
    const dailyTotals=Array.from({length:7},(_,i)=>{const day=addDays(dateKey(member.now,plan?.timezone||'Asia/Tashkent'),i-6);return {day,minutes:weekFocus.filter(record=>dateKey(Date.parse(record.timestamp),plan?.timezone||'Asia/Tashkent')===day).reduce((sum,record)=>sum+record.duration/60,0)};});
    const maximumDay=Math.max(1,...dailyTotals.map(day=>day.minutes));
    const focusMinutes = weekFocus.reduce((sum, s) => sum + s.duration / 60, 0);
    const fmt = (n: number) => new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: plan?.timezone || 'Asia/Tashkent', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(n);
    const context = () => JSON.stringify({ goals: profile?.goals || [], tasks: e.active.slice(0, 15).map(t => ({ title: t.title, minutes: t.minutes, deadline: t.deadline })), missed: e.missed.length, dueCards: e.due.length, weak: e.weak.slice(0, 8).map(w => ({ term: w.card.front, misses: w.misses })), last7Days: { completedTasks: e.completed.length, focusMinutes, reviewAttempts: e.recent.length } });
    const generate = async (mode = tool) => {
        if (!member.access.entitled || pending.current)
            return;
        const id = ++generation.current;
        pending.current = true;
        setBusy(true);
        setError('');
        setMessage('');
        setDraft([]);
        setOutput('');
        try {
            const result = await membershipCall<{
                text?: string;
            }>('generateAiResponse', { feature: 'intelligence', premiumMode: mode, retries: 0, contents: `Language: ${locale}.\n${mode === 'briefing' ? context() : source.slice(0, 20000)}${mode !== 'briefing' && consent ? '\nAuthorized context: ' + context() : ''}`, config: { maxOutputTokens: 3000 } });
            if (!active.current || id !== generation.current)
                return;
            if (!result.text?.trim())
                throw new Error();
            if (mode === 'deck')
                setDraft(validateDeckDraft(result.text));
            else
                setOutput(result.text);
            void trackUserEvent(uid, 'premium_feature_used', 0, { feature: mode }).catch(() => { });
            void member.refresh();
        }
        catch {
            if (active.current && id === generation.current)
                setError(c.error);
        }
        finally {
            if (active.current && id === generation.current) {
                pending.current = false;
                setBusy(false);
            }
        }
    };
    const saveDeck = () => { if (!title.trim() || !draft.length)
        return; try {
        const id = crypto.randomUUID();
        flash.saveDeck(normalizeDeck({ title: title.trim(), subject: plan?.subjects[0]?.name || '', updatedAt: new Date().toISOString() }, id));
        flash.saveCards(id, draft.map((r, i) => ({ ...emptyCard(id, i), ...r })));
        setMessage(c.deviceSaved);
        setDraft([]);
        setTitle('');
    }
    catch {
        setError(c.error);
    } };
    const saveNote = async () => { try {
        const sync = await writeDocWithQueue({ userId: uid, path: ['users', uid, 'notebookNotes', crypto.randomUUID()], data: { tags: [], title: title.trim() || c.summary, content: output, userId: uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, merge: false });
        if (active.current)
            setMessage(sync === 'synced' ? c.saved : c.deviceSaved);
    }
    catch {
        if (active.current)
            setError(c.error);
    } };
    const exportReport = () => { if (!member.access.entitled)
        return; const content = [`# NOVIQ — ${c.weekly}`, new Date(member.now).toISOString(), `${c.completed}: ${e.completed.length}`, `${c.minutes}: ${focusMinutes}`, `${c.sample}: ${weekFocus.length} / ${focus.length}`, c.sampleLimit, `${c.attempts}: ${e.recent.length}`, `${c.due}: ${e.due.length}`, ...e.completed.map(t => `- ${t.title}`), c.notMastery, c.noPrediction].join('\n'); const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'noviq-weekly-review.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    const captureWork = async () => { if (!capture.trim() || pending.current)
        return; setError(''); try {
        if (captureMode === 'task') {
            if (!plan || !plan.subjects[0] || !planner.save({ ...plan, tasks: [...plan.tasks, { id: crypto.randomUUID(), subjectId: plan.subjects[0].id, title: capture.trim().slice(0, 180), minutes: 30, priority: 2, description: capture.trim(), type: 'Practice', resource: '', flexibility: 'flexible', repeat: 'none', repeatUntil: '', createdAt: Date.now(), completed: false }] }, 'Quick capture assignment'))
                throw new Error();
            setMessage(c.deviceSaved);
        }
        else {
            const sync = await writeDocWithQueue({ userId: uid, path: ['users', uid, 'notebookNotes', crypto.randomUUID()], data: { tags: [], title: capture.trim().slice(0, 160), content: capture.trim(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), userId: uid }, merge: false });
            if (active.current)
                setMessage(sync === 'synced' ? c.saved : c.deviceSaved);
        }
        if (active.current)
            setCapture('');
    }
    catch {
        if (active.current)
            setError(c.error);
    } };
    const saveMistake = async () => { if (!journalTopic.trim() || !journalText.trim() || pending.current)
        return; try {
        const sync = await writeDocWithQueue({ userId: uid, path: ['users', uid, 'notebookNotes', crypto.randomUUID()], data: { tags: [], title: journalTopic.trim(), content: journalText.trim(), kind: 'mistake', confidence, subjectId: journalSubject || plan?.subjects[0]?.id || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), userId: uid }, merge: false });
        if (active.current) {
            setJournalTopic('');
            setJournalText('');
            setMessage(sync === 'synced' ? c.saved : c.deviceSaved);
        }
    }
    catch {
        if (active.current)
            setError(c.error);
    } };
    const next = e.upcoming[0], nextTask = next ? plan?.tasks.find(t => t.id === next.taskId) : e.active[0];
    const onboarding = async (step: number, completed = false) => { try {
        await writeDocWithQueue({ userId: uid, path: ['users', uid, 'proExperience', 'onboarding'], data: { step, completed, updatedAt: new Date().toISOString() }, merge: true });
        if (active.current)
            setExperience({ step, completed });
    }
    catch {
        setError(c.error);
    } };
    const onboardingSteps = [c.welcome, c.goal, c.flow, c.intelligence, c.next];
    const recall = e.recent.length ? Math.round(100 * e.recent.filter(a => a.correct).length / e.recent.length) : null;
    if (!preview && tab === 'overview') return <GlassDashboard plan={plan} now={member.now} status={dataStatus} due={e.due.length} records={study.records} blocked={!!planner.conflict || planner.blocked} save={planner.save} retry={() => { planner.retry(); study.retry(); void flash.retrySync(); }} explore={() => setTab('reports')}/>;
    return <div className={`ascend ascend-hub ${preview ? 'ascend-preview' : ''}`}>
  {preview && <section className="ascend-preview-strip"><div><strong>{c.previewLabel}</strong><p>{c.previewHelp}</p></div><TrialButton /><button className="ascend-button" onClick={closePreview}>{c.close}</button></section>}
  <header className="ascend-hub-heading"><div><span className="ascend-wordmark">NOVIQ PRO</span><h1>{locale === 'uz' ? 'Salom' : locale === 'ru' ? '\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435' : 'Hello'}{profile?.displayName?.trim() ? `, ${profile.displayName.trim().split(/\s+/)[0]}` : ''}!</h1><p>{locale === 'uz' ? 'Haftalik o\u2018qish natijalaringiz' : locale === 'ru' ? '\u0412\u0430\u0448 \u0443\u0447\u0435\u0431\u043d\u044b\u0439 \u043e\u0431\u0437\u043e\u0440 \u0437\u0430 \u043d\u0435\u0434\u0435\u043b\u044e' : 'Here\u2019s your weekly learning overview'}</p></div><a className="ascend-button" href="#/pricing">{c.membership}<ArrowUpRight size={16}/></a></header>

  <nav className="ascend-tabs" aria-label={c.intelligence}>{(['overview', 'exam', 'atlas', 'reports', 'studio'] as const).map(v => <button key={v} aria-pressed={tab === v} onClick={() => { setTab(v); setError(''); }}>{c[v]}</button>)}</nav>
  {(planner.error || flash.blocked || feedError || study.error) && <p className="ascend-notice" role="alert">{c.loadError}<button className="ascend-button" onClick={() => { planner.retry(); study.retry(); void flash.retrySync(); }}>{c.retry}</button></p>}
  {(!planner.known || !flash.ready || !focusReady) && <p role="status">{c.loading}</p>}
  {study.deviceSeconds > 0 && <p role="status">{locale === 'uz' ? 'Qurilmada saqlangan fokus vaqti ham kiritilgan; serverga yuborilmagan.' : locale === 'ru' ? 'Включено время фокуса, сохранённое только на этом устройстве.' : 'Includes focus activity saved only on this device; not synchronized to the server.'}</p>}
  {tab === 'overview' && <>
   {preview ? <ReferenceOverview dataStatus={dataStatus} active={e.active.length} completed={e.completed.length} progressCompleted={plan?.tasks.filter(task => task.completed).length || 0} minutes={focusMinutes} due={e.due.length} days={dailyTotals} nextTitle={nextTask?.title || ''} nextTime={next ? fmt(next.start) : undefined} busy={busy} briefingAllowed={member.access.entitled} onBriefing={() => void generate('briefing')}/> : <LiquidToday plan={plan} now={member.now} loading={!planner.known} blocked={!!planner.conflict || planner.blocked} save={planner.save}/>}
  {!preview && member.access.entitled && experience && !experience.completed && <section className="ascend-welcome"><Compass size={28}/><div><p>{(experience.step || 0) + 1} / 5</p><h2>{onboardingSteps[experience.step || 0]}</h2><p>{c.onboardHelp}</p>{profile?.goals?.length ? <p>{profile.goals.join(', ')}</p> : <a href="#/planner">{c.goal}</a>}</div><div className="ascend-actions"><button className="ascend-button ascend-primary" onClick={() => void onboarding(Math.min(4, (experience.step || 0) + 1), (experience.step || 0) >= 4)}>{c.enter}</button><button className="ascend-button" onClick={() => void onboarding(4, true)}>{c.skip}</button></div></section>}
   <div className="ascend-overview-grid"><section><h2>{c.weak}</h2><p>{c.weakHelp}</p>{e.weak.length ? e.weak.slice(0, 4).map(w => <div className="ascend-evidence-row" key={w.card.deckId + ':' + w.card.id}><strong>{w.card.front}</strong><span>{c.evidence}: {w.misses}</span><a href="#/flashcards">{c.cards}</a></div>) : <p>{c.empty}</p>}</section><section><h2>{c.weekly}</h2><dl className="ascend-ledger"><div><dt>{c.minutes}</dt><dd>{focusMinutes}</dd></div><div><dt>{c.completed}</dt><dd>{e.completed.length}</dd></div><div><dt>{c.recall}</dt><dd>{recall === null ? '—' : recall + '%'}</dd></div></dl><p>{c.sample}: {e.recent.length} {c.attempts}</p><p>{c.sampleLimit}</p><p>{c.notMastery}</p></section></div>
   <section className="ascend-capture"><h2>{c.capture}</h2><p>{c.captureHelp}</p><form onSubmit={ev => { ev.preventDefault(); void captureWork(); }}><label>{c.capture}<input required maxLength={3000} value={capture} onChange={ev => setCapture(ev.target.value)}/></label><label>{c.capture}<select value={captureMode} onChange={ev => setCaptureMode(ev.target.value)}><option value="note">{c.note}</option><option value="task" disabled={!plan?.subjects.length}>{c.task}</option></select></label>{captureMode === 'task' && <p>{c.estimate}</p>}<button className="ascend-button" disabled={!capture.trim()}>{c.save}</button></form></section>
   <PremiumGate feature="intelligence"><section className="ascend-brief"><h2>{c.intelligence}</h2><p>{c.briefHelp}</p><button className="ascend-button ascend-primary" disabled={busy} onClick={() => void generate('briefing')}><Sparkles size={16}/>{busy ? c.working : c.briefing}</button></section></PremiumGate>
  </>}
  {tab === 'exam' && <PremiumGate feature="examCenter"><section className="ascend-exam"><h2>{c.exam}</h2><p>{c.noPrediction}</p>{plan?.subjects.length ? plan.subjects.map(s => { const unfinished = e.active.filter(t => t.subjectId === s.id), done = plan.tasks.filter(t => t.subjectId === s.id && t.completed); let days: number | null = null; try {
        if (s.deadline)
            days = Math.ceil((localInstant(s.deadline, '23:59', plan.timezone) - member.now) / 86400000);
    }
    catch { } return <article key={s.id}><div><h3>{s.name}</h3><p>{s.target || c.goal}</p><p>{days === null ? c.noDeadline : `${days} ${c.days} · ${s.deadline}`}</p></div><div><strong>{done.length} / {done.length + unfinished.length}</strong><p>{c.completed}</p><a className="ascend-button" href="#/planner">{c.plan}</a></div></article>; }) : <p>{c.empty}</p>}</section></PremiumGate>}
  {tab === 'exam' && <PremiumGate feature="examCenter"><section className="ascend-mistakes"><h2>{c.mistakeJournal}</h2><p>{c.selfReported}</p><form onSubmit={event => { event.preventDefault(); void saveMistake(); }}><label>{c.goal}<select value={journalSubject || plan?.subjects[0]?.id || ''} onChange={event => setJournalSubject(event.target.value)}>{plan?.subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>{c.topic}<input required value={journalTopic} onChange={event => setJournalTopic(event.target.value)} maxLength={160}/></label><label>{c.reflectionLabel}<textarea required value={journalText} onChange={event => setJournalText(event.target.value)} maxLength={5000}/></label><label>{c.confidence}<select value={confidence} onChange={event => setConfidence(event.target.value)}><option value="needs-review">{c.needsReview}</option><option value="practiced">{c.practiced}</option></select></label><button className="ascend-button" disabled={!journalTopic.trim() || !journalText.trim()}>{c.save}</button></form>{notes.filter(n => n.kind === 'mistake').map(note => <article className="ascend-evidence-row" key={note.id}><strong>{note.title}</strong><span>{note.confidence === 'practiced' ? c.practiced : c.needsReview}</span><button className="ascend-button" onClick={() => { setSource(note.title + '\n' + note.content); setTool('coach'); setOutput(''); setDraft([]); setTab('studio'); }}>{c.explain}</button><a href="#/notes">{c.notes}</a><a href="#/flashcards">{c.cards}</a><a href="#/planner">{c.plan}</a></article>)}</section></PremiumGate>}
  {tab === 'atlas' && <PremiumGate feature="atlas"><section className="ascend-atlas"><h2>{c.atlas}</h2><p>{c.notMastery}</p>{plan?.subjects.length ? plan.subjects.map(s => <details key={s.id} open><summary><Orbit size={20}/>{s.name}</summary><div className="ascend-topic-branches">{plan.tasks.filter(t => t.subjectId === s.id).map(t => <a href="#/planner" key={t.id} className={t.completed ? 'ascend-topic-done' : ''}><span className="ascend-topic-dot"/><strong>{t.title}</strong><small>{t.completed ? c.completed : c.pending}</small></a>)}{!plan.tasks.some(t => t.subjectId === s.id) && <p>{c.empty}</p>}</div></details>) : <p>{c.empty}</p>}<div className="ascend-actions"><a href="#/tutor">{c.tutor}</a><a href="#/notes">{c.notes}</a><a href="#/flashcards">{c.cards}</a></div></section></PremiumGate>}
  {tab === 'reports' && <PremiumGate feature="reports"><section><div className="ascend-section-heading"><div><h2>{c.weekly}</h2><p>{c.sample}: {weekFocus.length} / {focus.length}</p><p>{c.sampleLimit}</p></div><button className="ascend-button" onClick={exportReport}><Download size={17}/>{c.export}</button></div><dl className="ascend-ledger"><div><dt>{c.minutes}</dt><dd>{focusMinutes}</dd></div><div><dt>{c.completed}</dt><dd>{e.completed.length}</dd></div><div><dt>{c.attempts}</dt><dd>{e.recent.length}</dd></div></dl><div className="ascend-week-bars" role="img" aria-label={c.minutes}>{dailyTotals.map(({day,minutes})=><div key={day}><strong>{Math.round(minutes)}</strong><i style={{height:Math.max(2,minutes/maximumDay*120)}}/><small>{day.slice(5)}</small></div>)}</div><p>{c.notMastery} {c.noPrediction}</p></section></PremiumGate>}
  {tab === 'studio' && <PremiumGate feature="intelligence"><section className="ascend-studio"><h2>{c.studio}</h2><p>{c.reviewDraft}</p><label>{c.studio}<select value={tool} disabled={busy} onChange={e => { setTool(e.target.value); setDraft([]); setOutput(''); }}>{[['coach', c.coach], ['practice', c.practiceTool], ['summary', c.summary], ['deck', c.deck]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label>{c.chooseNote}<select value="" onChange={ev => { const note = notes.find(n => n.id === ev.target.value); if (note)
        setSource(note.title + '\n' + note.content); }}><option value="">{c.chooseNote}</option>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select></label><label>{c.importText}<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async (ev) => { const file = ev.target.files?.[0]; if (!file)
        return; try {
        if (file.size > 1000000)
            throw new Error();
        setSource((await file.text()).slice(0, 20000));
    }
    catch {
        setError(c.error);
    } ev.target.value = ''; }}/></label><label>{c.source}<textarea aria-label={c.source} value={source} onChange={e => setSource(e.target.value)} maxLength={20000} rows={7}/></label><label className="ascend-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>{c.consent}</label><button className="ascend-button ascend-primary" disabled={busy || !source.trim()} onClick={() => void generate()}>{busy ? c.working : c.generate}</button><p>{c.notUnlimited} {c.quota}: {member.access.quotas.intelligence}</p></section></PremiumGate>}
  {busy && <p role="status">{c.working}</p>}{error && <p className="ascend-notice" role="alert">{error}</p>}{message && <p className="ascend-notice" role="status">{message}</p>}
  {output && <section className="ascend-output"><h2>{c.reviewDraft}</h2><ReactMarkdown>{output}</ReactMarkdown><label>{c.deckTitle}<input value={title} maxLength={160} onChange={e => setTitle(e.target.value)}/></label><button className="ascend-button" onClick={() => void saveNote()}>{c.saveNote}</button></section>}
  {!!draft.length && <section className="ascend-draft"><h2>{c.reviewDraft}</h2><label>{c.deckTitle}<input value={title} maxLength={160} onChange={e => setTitle(e.target.value)}/></label>{draft.map((row, i) => <div className="ascend-draft-row" key={i}><label>{c.front}<textarea aria-label={c.front} value={row.front} maxLength={2000} onChange={e => setDraft(rows => rows.map((r, j) => i === j ? { ...r, front: e.target.value } : r))}/></label><label>{c.back}<textarea aria-label={c.back} value={row.back} maxLength={5000} onChange={e => setDraft(rows => rows.map((r, j) => i === j ? { ...r, back: e.target.value } : r))}/></label></div>)}<button className="ascend-button ascend-primary" disabled={!title.trim() || draft.some(r => !r.front.trim() || !r.back.trim()) || flash.blocked || !flash.ready} onClick={saveDeck}>{c.saveDeck}</button></section>}
  {member.access.state === 'PRO_TRIAL' && <section className="ascend-trial-journey"><h2>{c.milestones}</h2><ol>{[[1, c.discover, '#/dashboard'], [2, c.personalize, '#/planner'], [3, c.practice, '#/flashcards'], [5, c.understand, '#/analytics'], [6, c.decide, '#/pricing'], [7, c.membership, '#/pricing']].map(([day, label, link]) => <li key={day}><span>{day}</span><a href={String(link)}>{label}</a></li>)}</ol></section>}
 </div>;
}
