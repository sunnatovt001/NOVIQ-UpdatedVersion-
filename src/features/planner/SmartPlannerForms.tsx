import React, { useEffect, useRef, useState } from 'react';
import { newId, newSubject, localInstant, type SmartPlan, type SmartTask, type WeeklyRange } from './smartPlannerModel';
import { loadLocalDataStrict, saveLocalData } from '@/src/lib/localStore';
import { SUBJECT_OPTIONS, subjectQuestions, type SmartCopy } from './smartPlannerCopy';
export function RangeEditor({ ranges, onChange, c, protectedTime = false }: {
    ranges: WeeklyRange[];
    onChange: (next: WeeklyRange[]) => void;
    c: SmartCopy;
    protectedTime?: boolean;
}) {
    const patch = (id: string, next: Partial<WeeklyRange>) => onChange(ranges.map(r => r.id === id ? { ...r, ...next } : r));
    return <div className="sp-ranges">{ranges.map(range => <fieldset key={range.id} className="sp-range">
    <legend>{range.label === 'Sleep' ? c.sleep : range.label || (protectedTime ? c.commitments : c.windows)}</legend>
    <div className="sp-form-grid"><label>{c.label}<input value={range.label === 'Sleep' ? c.sleep : range.label} maxLength={100} onChange={e => patch(range.id, { label: e.target.value })}/></label>
      <label>{c.start}<input required type="time" value={range.start} onChange={e => patch(range.id, { start: e.target.value })}/></label>
      <label>{c.end}<input required type="time" value={range.end} onChange={e => patch(range.id, { end: e.target.value })}/></label>
      <label>{c.date}<input type="date" value={range.date || ''} onChange={e => patch(range.id, { date: e.target.value })}/></label>
      {!range.date && <label>{c.until}<input type="date" value={range.until || ''} onChange={e => patch(range.id, { until: e.target.value })}/></label>}
    </div>
    {!range.date && <div className="sp-days" role="group" aria-label={c.days}>{c.days.split('|').map((day, index) => <button key={day} type="button" aria-pressed={range.days.includes(index)} onClick={() => patch(range.id, { days: range.days.includes(index) ? range.days.filter(d => d !== index) : [...range.days, index] })}>{day}</button>)}</div>}
    <button type="button" className="sp-text" onClick={() => onChange(ranges.filter(r => r.id !== range.id))}>{c.remove}</button>
  </fieldset>)}<button type="button" className="sp-button" onClick={() => onChange([...ranges, { id: newId(), label: '', days: [1, 2, 3, 4, 5], start: protectedTime ? '09:00' : '17:00', end: protectedTime ? '16:00' : '19:00' }])}>+ {c.add}</button></div>;
}
export function SmartTaskForm({ plan, c, task, onSave, onCancel }: {
    plan: SmartPlan;
    c: SmartCopy;
    task?: SmartTask;
    onSave: (task: SmartTask) => boolean;
    onCancel?: () => void;
}) {
    const draftKey = `noviq:${plan.userId}:plannerTaskDraft:${task?.id || 'new'}:v3`;
    const [stored] = useState(() => { try {
        const value = loadLocalDataStrict<any>(draftKey, null);
        if (value && (!value.fields || typeof value.fields.title !== 'string' || typeof value.fields.subjectId !== 'string' || !Number.isFinite(value.fields.minutes)))
            throw new Error();
        return { value, broken: false };
    }
    catch {
        return { value: null, broken: true };
    } });
    const recovered = stored.value?.baseRevision === plan.revision ? stored.value.fields : null;
    const draftDirty = useRef(false);
    const [pendingRecovery, setPendingRecovery] = useState(!!stored.value && !recovered);
    const [title, setTitle] = useState<string>(recovered?.title ?? task?.title ?? ''), [subjectId, setSubjectId] = useState<string>(recovered?.subjectId ?? task?.subjectId ?? plan.subjects[0]?.id ?? '');
    const [minutes, setMinutes] = useState<number>(recovered?.minutes ?? task?.minutes ?? 30), [priority, setPriority] = useState<number>(recovered?.priority ?? task?.priority ?? 2);
    const [description, setDescription] = useState<string>(recovered?.description ?? task?.description ?? ''), [type, setType] = useState<string>(recovered?.type ?? task?.type ?? 'Practice'), [resource, setResource] = useState<string>(recovered?.resource ?? task?.resource ?? '');
    const [deadline, setDeadline] = useState<string>(() => recovered?.deadline ?? (task?.deadline ? new Intl.DateTimeFormat('sv-SE', { timeZone: plan.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(task.deadline).replace(' ', 'T') : ''));
    const [repeat, setRepeat] = useState<SmartTask['repeat']>(recovered?.repeat ?? task?.repeat ?? 'none'), [repeatUntil, setRepeatUntil] = useState<string>(recovered?.repeatUntil ?? task?.repeatUntil ?? '');
    const [flexibility, setFlexibility] = useState<SmartTask['flexibility']>(recovered?.flexibility ?? task?.flexibility ?? 'flexible'), [dependency, setDependency] = useState<string>(recovered?.dependency ?? task?.dependsOn?.[0] ?? ''), [error, setError] = useState(false), [draftError, setDraftError] = useState(stored.broken);
    useEffect(() => { if (!draftDirty.current || pendingRecovery || stored.broken)
        return; const timer = setTimeout(() => { try {
        saveLocalData(draftKey, { baseRevision: plan.revision, fields: { title, subjectId, minutes, priority, description, type, resource, deadline, repeat, repeatUntil, flexibility, dependency } });
    }
    catch {
        setDraftError(true);
    } }, 350); return () => clearTimeout(timer); }, [title, subjectId, minutes, priority, description, type, resource, deadline, repeat, repeatUntil, flexibility, dependency, pendingRecovery]);
    const resumeDraft = () => { draftDirty.current = true; const f = stored.value?.fields; if (!f)
        return; setTitle(f.title); setSubjectId(f.subjectId); setMinutes(f.minutes); setPriority(f.priority); setDescription(f.description || ''); setType(f.type || 'Practice'); setResource(f.resource || ''); setDeadline(f.deadline || ''); setRepeat(f.repeat || 'none'); setRepeatUntil(f.repeatUntil || ''); setFlexibility(f.flexibility || 'flexible'); setDependency(f.dependency || ''); setPendingRecovery(false); };
    const suggestions = /IELTS/i.test(plan.subjects.find(s => s.id === subjectId)?.name || '') ? ['Reading', 'Writing', 'Listening', 'Speaking', 'Vocabulary', 'Homework', 'Mock exam', 'Error review'] : /SAT/i.test(plan.subjects.find(s => s.id === subjectId)?.name || '') ? ['Math', 'Reading and Writing', 'Timed practice', 'Error review', 'Homework', 'Mock exam'] : ['Practice', 'Homework', 'Project', 'Review', 'Reading'];
    return <form className="sp-task-form" onChange={() => {
            draftDirty.current = true;
            if (pendingRecovery) {
                // Editing the current fields must still survive refresh. Preserve
                // the older proposal separately before storing this new draft.
                try { saveLocalData(draftKey + ':recovery', stored.value); setPendingRecovery(false); }
                catch { setDraftError(true); }
            }
        }} onSubmit={e => {
            e.preventDefault();
            setError(false);
            try {
                if (!title.trim() || !plan.subjects.some(s => s.id === subjectId) || !Number.isFinite(minutes) || minutes < 1 || minutes > 10080)
                    throw new Error();
                if (resource && !/^https?:\/\//i.test(resource))
                    throw new Error();
                const due = deadline ? localInstant(deadline.slice(0, 10), deadline.slice(11, 16), plan.timezone) : undefined;
                const next: SmartTask = { ...task, id: task?.id || newId(), title: title.trim(), subjectId, minutes, priority, description, type, resource, flexibility, repeat, repeatUntil, createdAt: task?.createdAt || Date.now(), completed: task?.completed || false, dependsOn: dependency ? [dependency] : [], ...(due ? { deadline: due } : {}) };
                if (!due)
                    delete next.deadline;
                if (onSave(next)) {
                    draftDirty.current = false;
                    if (!stored.broken)
                        localStorage.removeItem(draftKey);
                    if (!task) {
                        setTitle('');
                        setDescription('');
                        setResource('');
                        setDeadline('');
                    }
                }
            }
            catch {
                setError(true);
            }
        }}>
    {pendingRecovery && <div className="sp-notice"><p>{c.taskDraftAvailable}</p><button type="button" className="sp-button" onClick={resumeDraft}>{c.resumeDraft}</button><button type="button" className="sp-text" onClick={() => { try {
        saveLocalData(draftKey + ':recovery', stored.value);
        setPendingRecovery(false);
    }
    catch {
        setDraftError(true);
    } }}>{c.useCurrentFields}</button></div>}
    {draftError && <p role="alert" className="sp-warning">{c.draftError}</p>}
    <label className="sp-task-title">{c.taskTitle}<input required autoFocus={!!task} maxLength={180} value={title} onChange={e => setTitle(e.target.value)}/></label>
    <div className="sp-form-grid"><label>{c.subject}<select aria-label={c.subject} required value={subjectId} onChange={e => setSubjectId(e.target.value)}>{plan.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>{c.duration}<input type="number" min={1} max={10080} required value={minutes} onChange={e => setMinutes(Number(e.target.value))}/></label>
      <label>{c.deadline}<input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}/></label>
      <label>{c.priority}<select aria-label={c.priority} value={priority} onChange={e => setPriority(Number(e.target.value))}><option value={1}>{c.low}</option><option value={2}>{c.normal}</option><option value={3}>{c.high}</option></select></label>
    </div>
    <details open={!!task}><summary>{c.description} · {c.repeat}</summary><div className="sp-form-grid">
      <label>{c.type}<input list="sp-task-types" value={type} maxLength={80} onChange={e => setType(e.target.value)}/><datalist id="sp-task-types">{suggestions.map(s => <option key={s} value={s}/>)}</datalist></label>
      <label>{c.resource}<input type="url" maxLength={2000} value={resource} onChange={e => setResource(e.target.value)}/></label>
      <label>{c.repeat}<select aria-label={c.repeat} value={repeat} onChange={e => setRepeat(e.target.value as SmartTask['repeat'])}><option value="none">{c.none}</option><option value="daily">{c.daily}</option><option value="weekly">{c.weekly}</option></select></label>
      {repeat !== 'none' && <label>{c.until}<input type="date" value={repeatUntil} onChange={e => setRepeatUntil(e.target.value)}/></label>}
      <label>{c.mode}<select aria-label={c.mode} value={flexibility} onChange={e => setFlexibility(e.target.value as SmartTask['flexibility'])}><option value="flexible">{c.flexible}</option><option value="fixed">{c.fixed}</option></select></label>
      <label>{c.depends}<select aria-label={c.depends} value={dependency} onChange={e => setDependency(e.target.value)}><option value="">—</option>{plan.tasks.filter(t => t.id !== task?.id).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    </div><label>{c.description}<textarea aria-label={c.description} maxLength={4000} rows={3} value={description} onChange={e => setDescription(e.target.value)}/></label></details>
    {error && <p role="alert" className="sp-warning">{c.invalid}</p>}
    <div className="sp-actions"><button className="sp-button sp-primary" disabled={!plan.subjects.length}>{task ? c.updateTask : c.addTask}</button>{onCancel && <button type="button" className="sp-button" onClick={onCancel}>{c.cancel}</button>}</div>
  </form>;
}
export function SmartSetup({ plan, c, uz, onChange, onFinish, onPreview, summary }: {
    plan: SmartPlan;
    c: SmartCopy;
    uz: boolean;
    onChange: (p: SmartPlan) => boolean;
    onFinish: () => void;
    onPreview: () => void;
    summary: React.ReactNode;
}) {
    const [search, setSearch] = useState('');
    const [validation, setValidation] = useState(false);
    const step = plan.step;
    const patch = (next: Partial<SmartPlan>) => onChange({ ...plan, ...next });
    const steps = c.steps.split('|');
    const editSubject = (id: string, field: string, value: string) => patch({ subjects: plan.subjects.map(s => s.id === id ? { ...s, [field]: value } : s) });
    const goNext = () => {
        try {
            if (step === 1 && !plan.subjects.length)
                throw new Error();
            if (step === 3) {
                new Intl.DateTimeFormat('en', { timeZone: plan.timezone });
                for (const r of [...plan.windows, ...plan.commitments]) {
                    if (!r.date && !r.days.length)
                        throw new Error();
                    localInstant(r.date || '2026-01-12', r.start, plan.timezone);
                    localInstant(r.date || '2026-01-12', r.end, plan.timezone);
                }
            }
            if (step === 4 && (plan.sessionMinutes < 5 || plan.sessionMinutes > 180 || plan.breakMinutes < 1 || plan.breakMinutes > 60 || plan.dailyLimit < 5 || plan.dailyLimit > 480))
                throw new Error();
            setValidation(false);
            patch({ step: step + 1 });
        }
        catch {
            setValidation(true);
        }
    };
    return <section className="sp-setup sp-panel" aria-labelledby="sp-setup-title">
    <div className="sp-setup-heading"><span className="sp-eyebrow">{c.setup} · {step + 1}/6</span><h2 id="sp-setup-title">{steps[step]}</h2><progress value={step + 1} max={6} aria-label={c.setup}/></div>
    {step === 0 && <><p>{c.situationHelp}</p><div className="sp-choices">{c.situations.split('|').map((label, i) => <button key={i} className="sp-choice" aria-pressed={plan.statuses.includes(String(i))} onClick={() => patch({ statuses: plan.statuses.includes(String(i)) ? plan.statuses.filter(s => s !== String(i)) : [...plan.statuses, String(i)] })}>{label}</button>)}</div></>}
    {step === 1 && <><p>{c.subjectHelp}</p><label>{c.custom}<input value={search} onChange={e => setSearch(e.target.value)} maxLength={80}/></label><div className="sp-choices">{SUBJECT_OPTIONS.filter(name => name.toLowerCase().includes(search.toLowerCase())).map(name => <button key={name} className="sp-choice" aria-pressed={plan.subjects.some(s => s.name === name)} onClick={() => { if (!plan.subjects.some(s => s.name === name))
            patch({ subjects: [...plan.subjects, newSubject(name)] }); }}>{name}{plan.subjects.some(s => s.name === name) ? ' ✓' : ''}</button>)}{search.trim() && !plan.subjects.some(s => s.name.toLowerCase() === search.trim().toLowerCase()) && <button className="sp-button" onClick={() => { patch({ subjects: [...plan.subjects, newSubject(search.trim())] }); setSearch(''); }}>+ {search}</button>}</div>
      {plan.subjects.map(s => <fieldset key={s.id} className="sp-range"><legend>{s.name}</legend><p>{subjectQuestions(s.name, uz)}</p><div className="sp-form-grid">{(['target', 'estimate', 'deadline', 'priorities'] as const).map(field => <label key={field}>{c[field]}<input type={field === 'deadline' ? 'date' : 'text'} maxLength={200} value={s[field]} onChange={e => editSubject(s.id, field, e.target.value)}/></label>)}</div><button className="sp-text" onClick={() => {
                    if (plan.tasks.some(t => t.subjectId === s.id))
                        return;
                    patch({ subjects: plan.subjects.filter(item => item.id !== s.id) });
                }} disabled={plan.tasks.some(t => t.subjectId === s.id)}>{c.remove}</button></fieldset>)}</>}
    {step === 2 && <><p>{c.methodHelp}</p>{plan.subjects.map(s => <fieldset className="sp-range" key={s.id}><legend>{s.name}</legend><div className="sp-choices">{(['self', 'tutor', 'hybrid'] as const).map(mode => <button key={mode} className="sp-choice" aria-pressed={s.mode === mode} onClick={() => editSubject(s.id, 'mode', mode)}>{c[mode]}</button>)}</div><label>{c.materials}<input value={s.materials} maxLength={500} onChange={e => editSubject(s.id, 'materials', e.target.value)}/></label>{s.mode !== 'tutor' && <label>{c.roadmap}<textarea value={s.roadmap} maxLength={2000} onChange={e => editSubject(s.id, 'roadmap', e.target.value)}/></label>}{s.mode !== 'self' && <p>{c.lessons}</p>}</fieldset>)}</>}
    {step === 3 && <><p>{c.availabilityHelp}</p><label>{c.timezone}<input value={plan.timezone} onChange={e => patch({ timezone: e.target.value })}/></label><h3>{c.windows}</h3><RangeEditor ranges={plan.windows} c={c} onChange={windows => patch({ windows })}/><h3>{c.commitments}</h3><div className="sp-choices">{[["0", c.schoolHours], ["1", c.universityHours], ["3", c.workHours]].filter(([status]) => plan.statuses.includes(status)).map(([status, label]) => <button key={status} className="sp-button" onClick={() => patch({ commitments: [...plan.commitments, { id: newId(), label, days: [1, 2, 3, 4, 5], start: "09:00", end: "16:00" }] })}>+ {label}</button>)}{plan.subjects.filter(s => s.mode !== "self").map(s => <button key={s.id} className="sp-button" onClick={() => patch({ commitments: [...plan.commitments, { id: newId(), label: s.name + " · " + c.lessonHours, days: [1, 3, 5], start: "16:00", end: "17:00" }] })}>+ {s.name} · {c.lessonHours}</button>)}</div><RangeEditor ranges={plan.commitments} c={c} protectedTime onChange={commitments => patch({ commitments })}/></>}
    {step === 4 && <><div className="sp-form-grid"><label>{c.focusLength}<input type="number" min={5} max={180} value={plan.sessionMinutes} onChange={e => patch({ sessionMinutes: Number(e.target.value) })}/></label><label>{c.breaks}<input type="number" min={1} max={60} value={plan.breakMinutes} onChange={e => patch({ breakMinutes: Number(e.target.value) })}/></label><label>{c.dailyLimit}<input type="number" min={5} max={480} value={plan.dailyLimit} onChange={e => patch({ dailyLimit: Number(e.target.value) })}/></label><label>{c.mode}<select aria-label={c.mode} value={plan.mode} onChange={e => patch({ mode: e.target.value as SmartPlan['mode'] })}>{(['blocked', 'list', 'hybrid'] as const).map(mode => <option key={mode} value={mode}>{c[mode]}</option>)}</select></label><label>{c.preferred}<select aria-label={c.preferred} value={plan.preference} onChange={e => patch({ preference: e.target.value as SmartPlan['preference'] })}>{(['morning', 'afternoon', 'evening'] as const).map(p => <option key={p} value={p}>{c[p]}</option>)}</select></label></div><label className="sp-checkbox"><input type="checkbox" checked={plan.split} onChange={e => patch({ split: e.target.checked })}/>{c.split}</label><p>{c.reminders}</p></>}
    {step === 5 && <><p>{c.summaryHelp}</p>{summary}<SmartTaskForm key={plan.subjects.map(s => s.id).join(',')} plan={plan} c={c} onSave={task => onChange({ ...plan, tasks: [...plan.tasks, task] })}/><button className="sp-button" onClick={onPreview}>{c.preview}</button></>}
    {validation && <p className="sp-warning" role="alert">{c.invalid}</p>}
    <div className="sp-setup-footer"><button className="sp-button" disabled={step === 0} onClick={() => patch({ step: Math.max(0, step - 1) })}>{c.back}</button>{step < 5 ? <button className="sp-button sp-primary" onClick={goNext}>{c.next}</button> : <button className="sp-button sp-primary" onClick={onFinish}>{c.savePlan}</button>}</div>
  </section>;
}
