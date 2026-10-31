import { navigateToPage } from '@/src/lib/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, Download, History, LockKeyhole, PanelRightClose, PanelRightOpen, Play, Plus, Settings2, X } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { loadLocalDataStrict, saveLocalData } from '@/src/lib/localStore';
import { useSmartPlanner, focusContextKey } from './useSmartPlanner';
import { SmartSetup, SmartTaskForm } from './SmartPlannerForms';
import { getSmartCopy } from './smartPlannerCopy';
import { addDays, availableRanges, buildSmartPreview, dateKey, estimateSuggestion, localInstant, type SmartPlan, type SmartTask } from './smartPlannerModel';
import { calendarDay, moveOrResize, sessionKey, subjectColor } from './calendarModel';
import { PlannerCalendar } from './PlannerCalendar';
import { ConflictPanel, ProposalPanel, type PlanProposal } from './PlannerReviewPanels';
import { loadPlanRevisions, type PlanRevision } from './plannerCloud';
import { clonePlan } from './plannerPersistence';
import type { StudyBlock } from './smartSchedule';
import './smartPlanner.css';
import {rebalanceAiSessions} from './aiPlanning';
import {topicFeedback,taskTopic} from './adaptivePlanning';
import {PlannerAiPanel} from './PlannerAiPanel';
import './plannerReference.css';
import { PlannerTaskRail } from './PlannerTaskRail';
import { useMembership } from '@/src/features/pro/MembershipContext';
export function SharedSmartPlanner({ onLegacy, referenceAppearance = true }: {
    referenceAppearance?: boolean;
    onLegacy: () => void;
}) {
    const { user } = useAuth();
    return user ? <PlannerWorkspace key={user.uid} uid={user.uid} onLegacy={onLegacy} referenceAppearance={referenceAppearance}/> : null;
}
function PlannerWorkspace({ uid, onLegacy, referenceAppearance }: {
    referenceAppearance: boolean;
    uid: string;
    onLegacy: () => void;
}) {
    const { locale } = useLocale(), c = useMemo(() => getSmartCopy(locale), [locale]);
    const {cinematic}=useMembership();
    const data = useSmartPlanner(uid), { plan, receipts } = data;
    const [now, setNow] = useState(Date.now()), [selectedDay, setSelectedDay] = useState(''), [view, setView] = useState<'day' | 'week'>(() => window.innerWidth < 900 ? 'day' : 'week');
    const [contextOpen, setContextOpen] = useState(!referenceAppearance), [taskPanel, setTaskPanel] = useState<{
        id: string;
        session?: StudyBlock;
        baseRevision: string;
    } | null>(null), [setup, setSetup] = useState<SmartPlan | null>(null), [proposal, setProposal] = useState<PlanProposal | null>(null), [problem, setProblem] = useState('');
    const [moving, setMoving] = useState(false), [moveTime, setMoveTime] = useState(''), [moveDuration, setMoveDuration] = useState(30), [historyOpen, setHistoryOpen] = useState(false), [revisions, setRevisions] = useState<PlanRevision[]>([]), [historyBusy, setHistoryBusy] = useState(false), [dismissed, setDismissed] = useState<string[]>([]);
    const panel = useRef<HTMLElement>(null), opener = useRef<HTMLElement | null>(null);
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
    useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && taskPanel) {
        e.preventDefault();
        setTaskPanel(null);
        opener.current?.focus();
    } if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]') && plan?.ready) {
        e.preventDefault();
        inspect('new');
    } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [taskPanel, plan?.ready]);
    const zone = plan?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = dateKey(now, zone), day = selectedDay || today;
    const first = view === 'week' ? addDays(day, -((new Date(day + 'T12:00Z').getUTCDay() + 6) % 7)) : day;
    const days = useMemo(() => Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => addDays(first, i)), [first, view]);
    const localeName = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB';
    const format = (n: number) => new Intl.DateTimeFormat(localeName, { timeZone: zone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(n);
    const time = (n: number) => new Intl.DateTimeFormat(localeName, { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(n);
    const actual = (id: string) => receipts.filter(r => r.taskId === id).reduce((sum, r) => sum + r.seconds / 60, 0);
    const signature = receipts.map(r => r.id + ':' + r.seconds).sort().join('|');
    const inspect = (id: string, session?: StudyBlock) => { opener.current = document.activeElement as HTMLElement; setTaskPanel({ id, session, baseRevision: plan?.revision || '' }); setMoving(false); setHistoryOpen(false); setTimeout(() => { const input = panel.current?.querySelector('input'); if (input)
        input.focus();
    else
        panel.current?.focus(); }, 0); };
    const intentional = (next: SmartPlan, description: string) => { const accepted = data.save(next, description); if (accepted) {
        setProposal(null);
        setProblem('');
    }
    else
        setProblem(c.saveError); return accepted; };
    const task = plan?.tasks.find(t => t.id === taskPanel?.id);
    const topicProgress=task?plan?.subjects.find(s=>s.id===task.subjectId)?.topics?.find(t=>t.key===taskTopic(task)):undefined;
    const active = plan?.tasks.filter(t => !t.completed && !plan.subjects.find(s => s.id === t.subjectId)?.paused) || [];
    const nextSession = plan?.sessions.filter(s => s.end > now && active.some(t => t.id === s.taskId)).sort((a, b) => a.start - b.start)[0];
    const nextTask = nextSession ? active.find(t => t.id === nextSession.taskId) : active.slice().sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity) || b.priority - a.priority)[0];
    const totals = useMemo(() => { if (!plan)
        return { free: 0, planned: 0, actual: 0 }; try {
        const r = calendarDay(plan, today);
        const allocations = plan.sessions.filter(s => s.end > now && dateKey(s.start, zone) === today);
        const recorded = receipts.filter(r => dateKey(r.timestamp, zone) === today).reduce((s, r) => s + r.seconds / 60, 0);
        const reserved = allocations.reduce((s, r) => s + (r.end - Math.max(now, r.start)) / 60000, 0);
        const free = availableRanges(r.available, allocations, now).reduce((s, r) => s + (r.end - r.start) / 60000, 0);
        return { free: Math.floor(Math.max(0, Math.min(free, plan.dailyLimit - recorded - reserved))), planned: Math.round(reserved), actual: Math.round(recorded) };
    }
    catch {
        return { free: 0, planned: 0, actual: 0 };
    } }, [plan, today, now, receipts, zone]);
    const exportBackup = () => { try {
        let queue: unknown = 'Unreadable queue remains preserved in this browser';
        try {
            const entries = JSON.parse(localStorage.getItem('noviq:offlineSyncQueue:v1') || '[]');
            if (Array.isArray(entries))
                queue = entries.filter((o: any) => o.userId === uid && o.path?.includes('planner'));
        }
        catch { }
        const taskDrafts = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith(`noviq:${uid}:plannerTaskDraft:`)).map(k => [k, localStorage.getItem(k)]));
        const backup = { confirmed: plan, draft: data.draft, rawConfirmed: localStorage.getItem(`noviq:${uid}:smartPlanner:v2`), rawDraft: localStorage.getItem(`noviq:${uid}:plannerDraft:v3`), taskDrafts, legacyQueue: queue, setup: localStorage.getItem(`noviq:${uid}:plannerSetupDraft:v3`), task: localStorage.getItem(`noviq:${uid}:plannerTaskDraft:v3`) };
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'noviq-planner-backup.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    catch {
        setProblem(c.backupFailed);
    } };
    const editSetup = (step = 1) => { if (!plan)
        return; try {
        const saved = loadLocalDataStrict<{
            baseRevision: string;
            plan: SmartPlan;
        } | null>(`noviq:${uid}:plannerSetupDraft:v3`, null);
        if (saved && saved.baseRevision !== plan.revision)
            saveLocalData(`noviq:${uid}:plannerSetupRecovery:v3`, saved);
        setSetup(saved?.baseRevision === plan.revision ? saved.plan : { ...clonePlan(plan), step, ready: false });
        setTaskPanel(null);
        setProposal(null);
    }
    catch {
        setProblem(c.draftError);
    } };
    const stageSetup = (next: SmartPlan) => { setSetup(next); try {
        saveLocalData(`noviq:${uid}:plannerSetupDraft:v3`, { baseRevision: plan?.revision, plan: next });
    }
    catch {
        setProblem(c.draftError);
    } return true; };
    const propose = () => { if (!plan)
        return; try {
        if (setup && setup.revision !== plan.revision)
            throw new Error();
        const source = setup || plan;
        const rounded = Math.ceil(Date.now() / 60000) * 60000;
        const result = buildSmartPreview(rebalanceAiSessions(source, receipts, rounded), receipts, rounded);
        const past = plan.sessions.filter(s => s.end <= Date.now() || plan.tasks.find(t => t.id === s.taskId)?.completed);
        const warnings = result.warnings.map(w => `${result.tasks.find(t => t.id === w.taskId)?.title || ''} · ${w.reason === 'locked-conflict' ? c.lockedWarning : w.reason === 'dependency' ? c.dependencyWarning : w.reason === 'review-estimate' ? c.reviewEstimate : c.capacityWarning}`);
        if (result.warnings.some(w => w.reason === 'locked-conflict'))
            warnings.push(c.lockedWarning);
        setProposal({ baseRevision: plan.revision, description: 'Apply reviewed schedule', receiptSignature: signature, plan: { ...source, revision: plan.revision, tasks: result.tasks, sessions: [...past, ...result.sessions].map(s => ({ ...s, id: sessionKey(s) })), ready: true, completedOnboardingAt: plan.completedOnboardingAt || Date.now() }, warnings });
        setProblem('');
    }
    catch {
        setProblem(c.invalid);
    } };
    const applyProposal = () => { if (!plan || !proposal)
        return; if (plan.revision !== proposal.baseRevision || signature !== proposal.receiptSignature || proposal.plan.sessions.some(s => s.start < Date.now() && s.start >= now && s.end > now && !s.locked)) {
        setProblem(c.previewStale);
        return;
    } if (intentional({ ...proposal.plan, revision: plan.revision }, proposal.description)) {
        setSetup(null);
        setProposal(null);
        setTaskPanel(null);
        localStorage.removeItem(`noviq:${uid}:plannerSetupDraft:v3`);
    } };
    const offerPlacement = (s: StudyBlock, start: number, duration: number) => { if (!plan)
        return; try {
        const next = moveOrResize(plan, s, start, duration, receipts, Date.now());
        setProposal({ plan: next, baseRevision: plan.revision, description: duration === (s.end - s.start) / 60000 ? 'Move session' : 'Resize session', receiptSignature: signature, warnings: [] });
        setMoving(false);
        setProblem('');
    }
    catch {
        setProblem(c.placementInvalid);
    } };
    const complete = (id: string) => { if (!plan)
        return; const t = plan.tasks.find(t => t.id === id); if (t)
        intentional({ ...plan, tasks: plan.tasks.map(task => task.id === id ? { ...task, completed: !task.completed, completedAt: task.completed ? undefined : Date.now() } : task) }, t.completed ? 'Reopen assignment' : 'Complete assignment'); };
    const startFocus = (t: SmartTask) => { if (data.conflict)
        return; try {
        saveLocalData(focusContextKey(uid), { taskId: t.id, title: t.title, subject: plan?.subjects.find(s => s.id === t.subjectId)?.name || t.title });
        saveLocalData(`noviq-focus-task-${uid}`, t.title);
        saveLocalData(`noviq-focus-task-done-${uid}`, false);
        navigateToPage('/focus');
    }
    catch {
        setProblem(c.draftError);
    } };
    const openHistory = async () => { setHistoryOpen(true); setTaskPanel(null); setHistoryBusy(true); try {
        setRevisions(await loadPlanRevisions(uid));
    }
    catch {
        setProblem(c.historyError);
    }
    finally {
        setHistoryBusy(false);
    } };
    useEffect(() => { if (proposal)
        document.getElementById('sp-review-heading')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [proposal]);
    const historyLabel = (description: string) => ({ 'Edit assignment': c.edit, 'Add assignment': c.addTask, 'Change subject color': c.subjectColor, 'Confirm first plan': c.savePlan, 'Move session': c.reschedule, 'Resize session': c.resize, 'Apply reviewed schedule': c.apply, 'Update planning preferences': c.settings, 'Restore previous version': c.restoreVersion, 'Reopen assignment': c.undo, 'Complete assignment': c.done, 'Change session lock': c.lock, 'Resolve concurrent edits': c.applyMerge } as Record<string, string>)[description] || description;
    const statusText = data.status === 'saving' ? c.saving : data.status === 'conflict' ? c.conflict : data.status === 'failed' ? c.failed : data.status === 'pending' ? c.pending : data.status === 'device' ? c.device : data.status === 'loading' ? c.loading : c.synced;
    if (!plan || data.blocked)
        return <div className="smart-planner sp-v21"><header className="sp-header"><div><span className="sp-eyebrow">NOVIQ / {c.workspace}</span><h1>{c.title}</h1></div></header><section className="sp-initial" aria-live="polite" aria-busy={!data.known && !data.error}><CalendarDays size={32}/><h2>{data.error ? c.loadProblem : data.known ? c.noPlan : c.loading}</h2>{!data.known && !data.error && <div className="sp-skeleton"><i /><i /><i /></div>}{data.error ? <><p>{c.saveError}</p><button className="sp-button" onClick={exportBackup}><Download size={16}/>{c.backup}</button>{!data.blocked && <button className="sp-button" onClick={data.retry}>{c.retry}</button>}</> : data.known && <button className="sp-button sp-primary" onClick={data.begin}>{c.createPlan}</button>}<button className="sp-text" onClick={onLegacy}>{c.legacy}</button></section></div>;
    const confirmed = plan.ready || !!plan.completedOnboardingAt;
    const weekAnchor = new Date(first + 'T12:00:00Z');
    weekAnchor.setUTCDate(weekAnchor.getUTCDate() + 4 - (weekAnchor.getUTCDay() || 7));
    const weekNumber = Math.ceil((((weekAnchor.getTime() - Date.UTC(weekAnchor.getUTCFullYear(), 0, 1)) / 86400000) + 1) / 7);
    const saveTask = (next: SmartTask) => { if (taskPanel && taskPanel.baseRevision !== plan.revision) {
        setProblem(c.formChanged);
        return false;
    } const accepted = intentional({ ...plan, tasks: plan.tasks.some(t => t.id === next.id) ? plan.tasks.map(t => t.id === next.id ? next : t) : [...plan.tasks, next] }, task ? 'Edit assignment' : 'Add assignment'); if (accepted) {
        setTaskPanel(null);
        localStorage.removeItem(`noviq:${uid}:plannerTaskDraft:v3`);
    } return accepted; };
    return <div className={`smart-planner sp-v21 ${referenceAppearance && confirmed && !setup ? "sp-reference" : ""}`}>
    <header className="sp-header"><div><span className="sp-eyebrow">NOVIQ / {c.workspace}</span><h1>{cinematic?c.title:locale==="uz"?"Haftangizni aniqroq rejalang.":locale==="ru"?"Спланируйте неделю яснее.":"Plan a clearer week."}</h1><p>{c.philosophy}</p></div><div className="sp-header-actions">{confirmed && <><button className="sp-button" onClick={openHistory}><History size={16}/>{c.versions}</button><button className="sp-button" onClick={() => editSetup()} disabled={data.conflict}><Settings2 size={16}/>{c.settings}</button><button className="sp-button sp-primary" onClick={() => inspect('new')} disabled={data.conflict} aria-keyshortcuts="N"><Plus size={17}/>{c.addTask}</button></>}</div></header>
    <div className={`sp-save-strip sp-status-${data.status}`}><p role="status"><span className="sp-status-dot"/>{statusText}</p><span>{plan.timezone}</span>{['failed', 'pending'].includes(data.status) && <button className="sp-text" onClick={data.retry}>{c.retrySave}</button>}<button className="sp-text" onClick={exportBackup}>{c.backup}</button></div>
    {data.conflict && <ConflictPanel key={data.confirmed?.revision || 'missing'} saved={data.confirmed} draft={data.draft} c={c} onSaved={data.acceptRemote} onMerge={data.applyMerged}/>}
    {(problem || data.error) && <div className="sp-warning" role="alert">{problem || c.saveError}<button className="sp-text" onClick={() => setProblem('')}>{c.dismiss}</button></div>}
    {proposal && <ProposalPanel current={plan} proposal={proposal} c={c} format={format} onApply={applyProposal} onCancel={() => setProposal(null)}/>}
    <div className={data.conflict ? 'sp-disabled' : ''} aria-disabled={data.conflict}>
    {(!confirmed || setup) ? <><div className="sp-setup-actions">{setup && <><div className="sp-segmented">{[1, 3, 4].map((step, i) => <button key={step} onClick={() => stageSetup({ ...setup, step })}>{[c.subject, c.windows, c.preferences][i]}</button>)}</div><button className="sp-button" onClick={() => { setSetup(null); setProposal(null); }}>{c.cancel}</button><button className="sp-button sp-primary" onClick={() => { if (setup.revision !== plan.revision) {
            setProblem(c.previewStale);
            return;
        } if (intentional({ ...setup, ready: true, revision: plan.revision, sessions: plan.sessions }, 'Update planning preferences')) {
            setSetup(null);
            localStorage.removeItem(`noviq:${uid}:plannerSetupDraft:v3`);
        } }}>{c.savePreferences}</button></>}</div><SmartSetup plan={setup || plan} c={c} uz={locale === 'uz'} onChange={setup ? stageSetup : next => data.save(next, 'Continue plan setup')} onPreview={propose} onFinish={propose} summary={<><p>{(setup || plan).subjects.map(s => s.name).join(' · ') || c.subjectHelp}</p><p>{c.currentPlanPreserved}</p></>}/></> : <>

      <section className="sp-day-brief"><div className="sp-next"><span className="sp-eyebrow">{c.nextUp}</span>{nextTask ? <><span className="sp-subject">{plan.subjects.find(s => s.id === nextTask.subjectId)?.name}</span><h2>{nextTask.title}</h2><p>{nextSession ? `${format(nextSession.start)}–${time(nextSession.end)}` : `${Math.max(0, Math.round(nextTask.minutes - actual(nextTask.id)))} ${c.minutes} · ${c.unscheduled}`}</p><div className="sp-actions"><button className="sp-button sp-primary" onClick={() => startFocus(nextTask)}><Play size={15}/>{c.focus}</button><button className="sp-text" onClick={() => inspect(nextTask.id, nextSession)}>{c.edit}</button></div></> : <><h2>{c.noToday}</h2><button className="sp-text" onClick={() => inspect('new')}>{c.addTask}</button></>}</div><div className="sp-today-ledger"><span className="sp-eyebrow">{c.todayShort}</span><strong>{totals.free}<small> {c.minutes}</small></strong><p>{c.remaining}</p><span>{totals.planned} {c.planned} · {totals.actual} {c.actual}</span></div></section>
      <div className={`sp-calendar-workspace ${!contextOpen && !taskPanel && !historyOpen ? 'sp-wide-calendar' : ''}`}>
        {referenceAppearance && <PlannerTaskRail day={day} locale={locale} searchable={!cinematic} plan={plan} c={c} onAdd={() => inspect('new')} onInspect={inspect} onComplete={complete}/>}
        <section className="sp-calendar-surface"><PlannerAiPanel plan={plan} receipts={receipts} locale={locale} disabled={!!data.conflict || data.blocked} onConfigure={next=>intentional(next,'Update daily AI planning preference')} onSettings={()=>editSetup(3)} onReview={(next,warnings)=>{setProblem('');setProposal({plan:next,baseRevision:plan.revision,receiptSignature:signature,description:'Apply reviewed AI study plan',warnings});}}/><div className="sp-calendar-toolbar"><div><h2>{referenceAppearance ? new Intl.DateTimeFormat(localeName, { month: 'long', year: 'numeric', timeZone: zone }).format(localInstant(first, '12:00', zone)) : c.calendar}{referenceAppearance && <span className="sp-week-number"> / W{weekNumber}</span>}</h2><p>{format(localInstant(first, '12:00', zone)).split(',')[0]}{days.length > 1 ? ` — ${format(localInstant(days.at(-1)!, '12:00', zone)).split(',')[0]}` : ''}</p></div><div className="sp-actions"><button className="sp-button" onClick={() => setSelectedDay('')}>{c.todayShort}</button><button className="sp-icon" aria-label={view === 'week' ? c.prevWeek : c.prevDay} onClick={() => setSelectedDay(addDays(day, view === 'week' ? -7 : -1))}><ArrowLeft size={17}/></button><input className="sp-date-picker" type="date" aria-label={c.chooseDate} value={day} onChange={e => e.target.value && setSelectedDay(e.target.value)}/><button className="sp-icon" aria-label={view === 'week' ? c.nextWeek : c.nextDay} onClick={() => setSelectedDay(addDays(day, view === 'week' ? 7 : 1))}><ArrowRight size={17}/></button></div></div><div className="sp-calendar-options"><div className="sp-segmented" aria-label={c.calendarView}><button aria-pressed={view === 'day'} onClick={() => setView('day')}>{c.dayView}</button><button aria-pressed={view === 'week'} onClick={() => setView('week')}>{c.weekView}</button></div><div className="sp-actions"><button className="sp-text" onClick={propose}>{c.optimizeWeek}</button><button className="sp-icon" aria-label={contextOpen ? c.collapseContext : c.expandContext} aria-pressed={contextOpen} onClick={() => setContextOpen(v => !v)}>{contextOpen ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button></div></div>
          <PlannerCalendar referenceAppearance={referenceAppearance} plan={plan} days={days} selected={day} now={now} c={c} locale={locale} onDay={setSelectedDay} onInspect={inspect} onDrop={offerPlacement} onComplete={complete}/>
        </section>
        {(taskPanel || historyOpen || contextOpen) && <aside className="sp-context" ref={panel} tabIndex={-1} aria-label={taskPanel ? c.edit : historyOpen ? c.versions : c.context}>
          {taskPanel ? <section className="sp-detail-panel"><div className="sp-section-heading"><h2>{task ? c.edit : c.addTask}</h2><button className="sp-icon" aria-label={c.closeDetails} onClick={() => { setTaskPanel(null); opener.current?.focus(); }}><X size={18}/></button></div>{task && <button type="button" className="sp-button sp-primary" disabled={!!data.conflict} onClick={() => startFocus(task)}><Play size={15}/>{c.focus}</button>}<SmartTaskForm key={taskPanel.id} plan={plan} c={c} task={task} onSave={saveTask} onCancel={() => setTaskPanel(null)}/>{task&&<section className="sp-topic-feedback"><h3>{locale==='uz'?'Mavzuni qay darajada tushundingiz?':locale==='ru'?'Как вы освоили тему?':'How well do you understand this topic?'}</h3><p>{locale==='uz'?'Javobingiz keyingi mashq va takrorlash vaqtini belgilaydi.':locale==='ru'?'Ответ определяет следующую практику и повторение.':'Your feedback sets the next practice and spaced review.'}</p>{topicProgress&&<p>{locale==='uz'?'Keyingi takrorlash':locale==='ru'?'Следующее повторение':'Next spaced review'}: {format(topicProgress.nextReviewAt)}</p>}<div className="sp-actions">{(['again','good','easy'] as const).map((rating,i)=><button key={rating} type="button" className="sp-button" onClick={()=>{intentional(topicFeedback(plan,task.id,rating,Date.now(),receipts), 'Record topic feedback');setTaskPanel(null);}}>{(locale==='uz'?['Qiyin bo‘ldi','Tushundim','Yaxshi bilaman']:locale==='ru'?['Было трудно','Понятно','Хорошо знаю']:['Needs practice','Understood','Know it well'])[i]}</button>)}</div></section>}{taskPanel.session && <div className="sp-session-detail"><h3>{c.scheduledSession}</h3><p>{format(taskPanel.session.start)} — {time(taskPanel.session.end)}</p><div className="sp-actions"><button className="sp-button" onClick={() => { setMoving(v => !v); setMoveTime(dateKey(taskPanel.session!.start, zone) + 'T' + time(taskPanel.session!.start)); setMoveDuration((taskPanel.session!.end - taskPanel.session!.start) / 60000); }}>{c.reschedule}</button><button className="sp-button" onClick={() => intentional({ ...plan, sessions: plan.sessions.map(s => sessionKey(s) === sessionKey(taskPanel.session!) ? { ...s, locked: !s.locked } : s) }, 'Change session lock')}><LockKeyhole size={14}/>{plan.sessions.find(s => sessionKey(s) === sessionKey(taskPanel.session!))?.locked ? c.unlock : c.lock}</button></div>{moving && <form className="sp-placement-form" onSubmit={e => { e.preventDefault(); try {
                    offerPlacement(plan.sessions.find(s => sessionKey(s) === sessionKey(taskPanel.session!))!, localInstant(moveTime.slice(0, 10), moveTime.slice(11, 16), zone), moveDuration);
                }
                catch {
                    setProblem(c.placementInvalid);
                } }}><label>{c.start}<input required type="datetime-local" value={moveTime} onChange={e => setMoveTime(e.target.value)}/></label><label>{c.duration}<input required type="number" min={5} max={480} value={moveDuration} onChange={e => setMoveDuration(Number(e.target.value))}/></label><button className="sp-button" disabled={!!plan.sessions.find(s => sessionKey(s) === sessionKey(taskPanel.session!))?.locked}>{c.previewPlacement}</button><p>{c.unlockHelp}</p></form>}</div>}{task && <div className="sp-detail-actions">{task.resource && /^https?:\/\//i.test(task.resource) && <a className="sp-button" href={task.resource} target="_blank" rel="noopener noreferrer">{c.material}</a>}<button className="sp-button" onClick={() => complete(task.id)}><Check size={16}/>{task.completed ? c.undo : c.done}</button><button className="sp-text" onClick={() => { setProposal({ baseRevision: plan.revision, description: 'Delete assignment', receiptSignature: signature, warnings: [], plan: { ...plan, tasks: plan.tasks.filter(t => t.id !== task.id && t.parentId !== task.id), sessions: plan.sessions.filter(s => s.taskId !== task.id && plan.tasks.find(t => t.id === s.taskId)?.parentId !== task.id) } }); }}>{c.remove}</button></div>}</section> : historyOpen ? <section className="sp-history-panel"><div className="sp-section-heading"><h2>{c.versions}</h2><button className="sp-icon" aria-label={c.closeDetails} onClick={() => setHistoryOpen(false)}><X size={18}/></button></div><p>{c.historyHelp}</p>{historyBusy ? <p role="status">{c.loading}</p> : revisions.length ? revisions.map(r => <article key={r.id}><strong>{historyLabel(r.description)}</strong><time>{format(r.createdAt)}</time><button className="sp-text" onClick={() => setProposal({ plan: { ...clonePlan(r.plan), revision: plan.revision }, baseRevision: plan.revision, description: 'Restore previous version', warnings: [], receiptSignature: signature })}>{c.restoreVersion}</button></article>) : <p>{c.noHistory}</p>}</section> : <>
          <section><div className="sp-section-heading"><h2>{c.deadlines}</h2></div>{active.filter(t => t.deadline).sort((a, b) => a.deadline! - b.deadline!).slice(0, 5).map(t => <button className="sp-deadline" key={t.id} onClick={() => inspect(t.id)}><strong>{t.title}</strong><span>{format(t.deadline!)}{t.deadline! < now ? ' · ' + c.overdue : ''}</span></button>)}{!active.some(t => t.deadline) && <p className="sp-muted">{c.noDeadlines}</p>}</section>
          <section><h2>{c.subject}</h2>{plan.subjects.map(s => <div className="sp-subject-row" key={s.id}><span><strong><i style={{ background: subjectColor(s.color) }}/>{s.name}</strong><small>{c[s.mode]}{s.paused ? ' · ' + c.paused : ''}</small></span><button className="sp-text" onClick={() => intentional({ ...plan, subjects: plan.subjects.map(other => other.id === s.id ? { ...other, paused: !other.paused } : other) }, s.paused ? 'Resume subject' : 'Pause subject')}>{s.paused ? c.resume : c.pause}</button><select className="sp-subject-color" aria-label={`${c.subjectColor}: ${s.name}`} value={subjectColor(s.color)} onChange={e => intentional({ ...plan, subjects: plan.subjects.map(other => other.id === s.id ? { ...other, color: e.target.value } : other) }, 'Change subject color')}>{['#2563eb', '#0891b2', '#059669', '#c2410c', '#7c3aed'].map((color, i) => <option value={color} key={color}>{c.colorNames.split('|')[i]}</option>)}</select></div>)}</section>
          <section><h2>{c.suggestions}</h2>{plan.sessions.some(s => s.end < now && !plan.tasks.find(t => t.id === s.taskId)?.completed) && !dismissed.includes('missed') ? <div className="sp-evidence-suggestion"><p>{c.missedHelp}</p><button className="sp-text" onClick={propose}>{c.reviewSuggestion}</button><button className="sp-text" onClick={() => setDismissed(v => [...v, 'missed'])}>{c.dismiss}</button></div> : <p className="sp-muted">{c.noSuggestions}</p>}{active.map(t => { const estimate = estimateSuggestion(t, plan.tasks, receipts); return estimate && !dismissed.includes(t.id) ? <div className="sp-evidence-suggestion" key={t.id}><strong>{t.title}</strong><p>{c.estimateSuggestion}: {estimate.minutes} {c.minutes} · {estimate.observations} {c.observations}</p><button className="sp-text" onClick={() => saveTask({ ...t, minutes: estimate.minutes })}>{c.applyEstimate}</button><button className="sp-text" onClick={() => setDismissed(v => [...v, t.id])}>{c.dismiss}</button></div> : null; })}</section>
        </>}
        </aside>}
      </div>
      {!referenceAppearance && <section className="sp-assignment-list"><div className="sp-section-heading"><div><span className="sp-eyebrow">{c.yourWork}</span><h2>{c.allTasks}</h2></div><button className="sp-button" onClick={() => inspect('new')}><Plus size={16}/>{c.addTask}</button></div>{!plan.tasks.length && <p className="sp-empty">{c.empty}</p>}{plan.tasks.map(t => <article className={`sp-assignment-row ${t.completed ? 'sp-completed' : ''}`} key={t.id}><button className="sp-icon" aria-label={`${t.completed ? c.undo : c.done}: ${t.title}`} aria-pressed={!!t.completed} onClick={() => complete(t.id)}><Check size={17}/></button><button className="sp-assignment-name" onClick={() => inspect(t.id)}><strong>{t.title}</strong><small>{plan.subjects.find(s => s.id === t.subjectId)?.name} · {t.minutes} {c.minutes}{t.deadline ? ' · ' + format(t.deadline) : ''}{t.deadline && t.deadline < now && !t.completed ? ' · ' + c.overdue : ''}</small></button><span className="sp-assignment-time">{Math.round(actual(t.id))} / {t.minutes} {c.minutes}</span><button className="sp-text" onClick={() => inspect(t.id)}>{c.edit}</button></article>)}</section>}
      <footer className="sp-links"><button className="sp-text" onClick={onLegacy}>{c.legacy}</button><a href="/notes">{c.notes}</a><a href="/flashcards">{c.flashcards}</a><a href="/tutor">{c.tutorLink}</a></footer>
    </>}
    </div>
  </div>;
}
