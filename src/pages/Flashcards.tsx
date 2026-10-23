import {ReferenceCardPreview} from '@/src/features/pro/ReferenceCardPreview';
import {useMembership} from '@/src/features/pro/MembershipContext';
import {ProEntry} from '@/src/features/pro/ProEntry';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layers, Plus, Search, Star, ArrowRight, CalendarDays, X, Download, Archive, Brain, CheckCircle2, Clock3, ChevronDown } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocale } from '@/src/contexts/LocaleContext';
import { useDialogFocus } from '@/src/lib/useDialogFocus';
import { loadLocalData, trySaveLocalData } from '@/src/lib/localStore';
import { useBodyScrollLock } from '@/src/lib/useBodyScrollLock';
import { useSmartPlanner, recordPlannerFocus } from '@/src/features/planner/useSmartPlanner';
import { dateKey, localInstant, type SmartTask } from '@/src/features/planner/smartPlannerModel';
import { useFlashcards } from '@/src/features/flashcards/useFlashcards';
import { Editor } from '@/src/features/flashcards/Editor';
import { Study, modeName } from '@/src/features/flashcards/Study';
import { due, emptyCard, cardValid, uniquePairs, shuffle, normalizeDeck, type Card, type Mode, type Session, type Review } from '@/src/features/flashcards/model';
import '@/src/features/flashcards/flashcards.css';
import '@/src/features/flashcards/glass-flashcards.css';
export function Flashcards() { const { user } = useAuth(); return user ? <FlashcardsWorkspace key={user.uid} uid={user.uid}/> : <p role="status">Sign in to open your private flashcards.</p>; }
function FlashcardsWorkspace({ uid }: {
    uid: string;
}) {
    const {cinematic: referenceAppearance} = useMembership();
    const { locale } = useLocale(), uz = locale === 'uz', t = (en: string, u: string) => uz ? u : en;
    const store = useFlashcards(uid), planner = useSmartPlanner(uid);
    const [selected, setSelected] = useState(new URLSearchParams(location.search).get('flashcardDeck') || ''), [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [sort, setSort] = useState('recent'), [editing, setEditing] = useState(false), [create, setCreate] = useState(false), [title, setTitle] = useState(''), [subject, setSubject] = useState(''), [description, setDescription] = useState('');
    const [session, setSession] = useState<Session | null>(null), [mode, setMode] = useState<Mode>('classic'), [shuffleOn, setShuffleOn] = useState(() => loadLocalData(`noviq:${uid}:flashcardShuffle`, true)), [scheduleOpen, setScheduleOpen] = useState(false), [planSubject, setPlanSubject] = useState(''), [reviewDate, setReviewDate] = useState(''), [cardSearch, setCardSearch] = useState(''), [page, setPage] = useState(0), [vocabulary, setVocabulary] = useState(true);
    const [libraryOpen, setLibraryOpen] = useState(() => window.matchMedia('(min-width:1280px)').matches);
    useEffect(() => {
        const media = window.matchMedia('(min-width:1280px)');
        const resize = () => setLibraryOpen(media.matches);
        media.addEventListener('change', resize);
        return () => media.removeEventListener('change', resize);
    }, []);
    const dialog = useRef<HTMLDivElement>(null);
    useEffect(() => { trySaveLocalData(`noviq:${uid}:flashcardShuffle`, shuffleOn); }, [uid, shuffleOn]);
    useBodyScrollLock(create);
    useDialogFocus(create, dialog, () => setCreate(false));
    useEffect(() => { if (!create)
        return; const root = document.getElementById('root'); if (!root)
        return; const before = root.inert; root.inert = true; return () => { root.inert = before; }; }, [create]);
    const { decks, cards, sessions } = store.library;
    const deck = decks.find(d => d.id === selected);
    const allCards = Object.values(cards).flat().filter(c => !c.deleted && cardValid(c));
    const deckCards = (cards[selected] || []).filter(c => !c.deleted).sort((a, b) => a.order - b.order);
    const validCards = deckCards.filter(cardValid), dueCards = validCards.filter(c => due(store.getReview(c)));
    const visible = deckCards.filter(c => (c.front + ' ' + c.back).toLowerCase().includes(cardSearch.toLowerCase()));
    const recent = sessions.filter(s => s.deckId === selected), resume = recent.find(s => !s.completed && s.cardIds.length > 0);
    const completed = sessions.filter(s => s.completed), attempts = completed.flatMap(s => s.attempts);
    const libraryDecks = useMemo(() => decks.filter(d => (filter === 'archived' ? d.archived : !d.archived) && (filter !== 'favorite' || d.favorite) && (d.title + ' ' + d.subject + ' ' + d.tags.join(' ')).toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)), [decks, filter, search, sort]);
    useEffect(() => { if (!selected && libraryDecks[0])
        setSelected(libraryDecks[0].id); }, [selected, libraryDecks]);
    useEffect(() => { setCardSearch(''); setPage(0); setScheduleOpen(false); }, [selected]);
    const action = (fn: () => void) => { try {
        fn();
    }
    catch (e) {
        store.setMessage(e instanceof Error ? e.message : 'Save failed');
    } };
    const createDeck = (e: React.FormEvent) => { e.preventDefault(); action(() => { if (!title.trim())
        return; const d = normalizeDeck({ title: title.trim(), subject, description, updatedAt: new Date().toISOString() }, crypto.randomUUID()); store.saveDeck(d); setSelected(d.id); setCreate(false); setEditing(true); setTitle(''); setDescription(''); }); };
    const saveStudy = (s: Session, r?: Review) => { r ? store.saveResult(s, r) : store.saveSession(s); setSession(s); };
    const finish = (s: Session) => {
        const task = planner.plan?.tasks.find(task => task.id === s.taskId);
        if (task && planner.plan && !planner.remote && s.completed) {
            // The session is the sole time source. No Focus timer or duplicate XP is started.
            action(() => { recordPlannerFocus(uid, `flashcards-${s.id}`, s.activeSeconds, Date.now(), false, { taskId: task.id, title: task.title, subject: planner.plan!.subjects.find(x => x.id === task.subjectId)?.name || '' }); const goal = (task as SmartTask & {
                flashcardGoal?: number;
            }).flashcardGoal || s.cardIds.length; if (s.attempts.length >= goal && !planner.save({ ...planner.plan!, tasks: planner.plan!.tasks.map(x => x.id === task.id ? { ...x, completed: true, completedAt: Date.now() } : x) }))
                throw new Error(t('Review saved. Complete its Planner task manually.', 'Takrorlash saqlandi. Planner vazifasini qo‘lda yakunlang.')); });
        }
    };
    const start = (onlyDue = false) => action(() => {
        if (!deck)
            return;
        let source = onlyDue ? dueCards : validCards;
        if (mode === 'match' || mode === 'choice')
            source = uniquePairs(source);
        if (!source.length || ['match', 'choice'].includes(mode) && source.length < 2)
            throw new Error(t('This mode needs at least two distinct question–answer pairs.', 'Bu rejim uchun kamida ikkita turli savol-javob juftligi kerak.'));
        if (mode === 'listen' && !('speechSynthesis' in window))
            throw new Error(t('Speech playback is unavailable on this device. Try typing instead.', 'Bu qurilmada ovoz yo‘q. Yozish rejimini sinang.'));
        source = mode === 'learn' ? source.sort((a, b) => getDifficulty(b) - getDifficulty(a)) : shuffleOn ? shuffle(source) : source;
        if (mode === 'match')
            source = source.slice(0, 6);
        else
            source = source.slice(0, 200);
        const taskId = new URLSearchParams(location.search).get('flashcardTask');
        const task = planner.plan?.tasks.find(x => x.id === taskId && x.resource.includes(`flashcardDeck=${encodeURIComponent(deck.id)}`));
        if (task)
            source = source.slice(0, (task as SmartTask & {
                flashcardGoal?: number;
            }).flashcardGoal || source.length);
        const next: Session = { id: crypto.randomUUID(), deckId: deck.id, mode, cardIds: source.map(c => c.id), index: 0, attempts: [], startedAt: new Date().toISOString(), activeSeconds: 0, completed: false, ...(task ? { taskId: task.id } : {}) };
        store.saveSession(next);
        setSession(next);
    });
    const getDifficulty = (c: Card) => { const r = store.getReview(c); return r.lapses * 10 - r.repetitions + (due(r) ? 5 : 0); };
    const scheduleReview = () => action(() => {
        const plan = planner.plan;
        if (!deck || !plan || planner.remote || planner.blocked || !planSubject || !reviewDate)
            throw new Error(t('Set up Planner and choose a subject and date first.', 'Avval Plannerni sozlab, fan va sanani tanlang.'));
        const id = `flashcard-review-${deck.id}-${reviewDate}`;
        if (plan.tasks.some(x => x.id === id)) {
            store.setMessage(t('This review is already in Planner.', 'Bu takrorlash Plannerda mavjud.'));
            return;
        }
        const url = new URL(location.href);
        url.searchParams.set('flashcardDeck', deck.id);
        url.searchParams.set('flashcardTask', id);
        url.hash = '/flashcards';
        const count = Math.min(20, dueCards.length || validCards.length);
        if (!count)
            throw new Error(t('Add cards first.', 'Avval kartochka qo‘shing.'));
        const task: SmartTask & {
            flashcardGoal: number;
        } = { id, flashcardGoal: count, subjectId: planSubject, title: `${t('Review', 'Takrorlash')}: ${deck.title}`, minutes: Math.max(5, Math.ceil(count * .5)), priority: 2, description: `${count} ${t('cards. Estimate: 30 seconds per card. Open the material link to study.', 'kartochka. Taxmin: har biriga 30 soniya. O‘rganish uchun material havolasini oching.')}`, type: 'Flashcards', resource: url.href, flexibility: 'flexible', repeat: 'none', repeatUntil: '', createdAt: Date.now(), notBefore: localInstant(reviewDate, '00:00', plan.timezone) };
        if (!planner.save({ ...plan, tasks: [...plan.tasks.filter(x => x.id !== id), task] }))
            throw new Error(t('Planner could not save. Retry after resolving its sync status.', 'Planner saqlamadi. Sinxronlashni tekshiring.'));
        store.setMessage(t('Review added to Planner. Your existing timetable was preserved.', 'Takrorlash Plannerga qo‘shildi. Mavjud jadval saqlandi.'));
        setScheduleOpen(false);
    });
    const download = (data: unknown, name: string) => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    const backup = () => { const raw = { v2: localStorage.getItem(`noviq:${uid}:flashcards:v2`), decks: localStorage.getItem(`noviq:${uid}:decks`), cards: localStorage.getItem(`noviq:${uid}:cardsByDeck`) }; download(raw, 'noviq-flashcards-backup.json'); };
    return <div className={`fc-workspace ${referenceAppearance ? 'fc-glass' : ''}`}>
    <header className="fc-heading"><div><span className="fc-eyebrow">NOVIQ / {t('ACTIVE LEARNING', 'FAOL O‘RGANISH')}</span><h2>{t('Flashcards', 'Kartochkalar')}<span className="fc-version">2.0</span></h2><p>{t('Create effortlessly. Learn actively. Remember longer.', 'Oson yarating. Faol o‘rganing. Uzoqroq eslang.')}</p></div><div className="fc-header-actions"><ProEntry area="deck"/><button className="fc-button" onClick={backup}><Download size={17}/>{t('Backup', 'Zaxira nusxa')}</button><button className="fc-primary" onClick={() => setCreate(true)} disabled={store.blocked || !store.ready}><Plus size={19}/>{t('Create deck', 'To‘plam yaratish')}</button></div></header>
    {(store.message || store.sync === 'failed' || store.blocked) && <div role="status" className="fc-notice"><p>{store.message}</p><button className="fc-button" onClick={() => void store.retrySync()}>{t('Retry sync', 'Qayta sinxronlash')}</button></div>}
    {!store.ready ? <p role="status">{t('Loading your library…', 'Kutubxona yuklanmoqda…')}</p> : <>
    {!referenceAppearance && <section className="fc-overview"><div><span className="fc-eyebrow">{t('YOUR NEXT SMALL WIN', 'KEYINGI KICHIK YUTUQ')}</span><h3>{allCards.length ? t('Keep what you learn.', 'O‘rganganingizni eslab qoling.') : t('A fresh start for your memory.', 'Xotirangiz uchun yangi boshlanish.')}</h3><p>{allCards.length ? `${allCards.filter(c => due(store.getReview(c))).length} ${t('cards ready for a little recall practice.', 'kartochka takrorlashga tayyor.')}` : t('Turn a word, question or concept into something you remember.', 'So‘z, savol yoki tushunchani esda qoladigan bilimga aylantiring.')}</p><button className="fc-link" onClick={() => deck ? start(true) : setCreate(true)}>{t('Start a review', 'Takrorlashni boshlash')}<ArrowRight size={18}/></button></div><div className="fc-overview-stat"><Layers size={28}/><strong>{allCards.length}</strong><span>{t('cards in your library', 'kutubxonadagi kartochkalar')}</span></div><div className="fc-overview-stat"><strong>{attempts.length ? `${Math.round(attempts.filter(a => a.correct).length / attempts.length * 100)}%` : '—'}</strong><span>{t('recent practice accuracy', 'so‘nggi mashq aniqligi')}</span><small>{attempts.length ? `${attempts.length} ${t('recorded attempts', 'saqlangan urinishlar')}` : t('Complete a session to see insights', 'Natija uchun mashg‘ulotni yakunlang')}</small></div></section>}
    {referenceAppearance && <section className="fg-summary" aria-label={t('Your flashcard activity', 'Kartochkalar faolligi')}>
      <div><span className="fg-summary-icon"><Layers size={24}/></span><span><strong>{allCards.length}</strong><small>{t('Cards in your library', 'Kutubxonadagi kartochkalar')}</small></span></div>
      <div><span className="fg-summary-icon"><Clock3 size={24}/></span><span><strong>{allCards.filter(c => due(store.getReview(c))).length}</strong><small>{t('Ready to review', 'Takrorlashga tayyor')}</small></span></div>
      <div><span className="fg-summary-icon"><CheckCircle2 size={24}/></span><span><strong>{completed.length}</strong><small>{t('Sessions completed', 'Yakunlangan mashg‘ulotlar')}</small></span></div>
      <p><Brain size={24}/>{t('A little recall today. A stronger memory tomorrow.', 'Bugun takrorlang. Ertaga yaxshiroq eslang.')}</p>
    </section>}
    <div className="fc-layout">{referenceAppearance ? <details className="pro-deck-library" open={libraryOpen} onToggle={e => setLibraryOpen(e.currentTarget.open)}><summary><span>{t('My library', 'Kutubxonam')} · {libraryDecks.length}</span><ChevronDown size={17}/></summary><aside className="fc-library"><div className="fc-section-heading"><h3>{t('My library', 'Kutubxonam')}</h3><span>{libraryDecks.length}</span></div><label className="fc-search"><Search size={17}/><input aria-label={t('Search decks', 'To‘plamlarni qidirish')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search decks, subjects, tags', 'To‘plam, fan, teg qidirish')}/></label><div className="fc-library-filters"><select aria-label={t('Library filter', 'Kutubxona filtri')} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t('All decks', 'Barcha to‘plamlar')}</option><option value="favorite">{t('Favorites', 'Sevimlilar')}</option><option value="archived">{t('Archived', 'Arxiv')}</option></select><select aria-label={t('Sort decks', 'Saralash')} value={sort} onChange={e => setSort(e.target.value)}><option value="recent">{t('Recent', 'So‘nggi')}</option><option value="title">{t('Title', 'Nomi')}</option></select></div><nav aria-label={t('Deck library', 'To‘plamlar kutubxonasi')}>{libraryDecks.map(d => <button key={d.id} className={`fc-deck-tile ${selected === d.id ? 'active' : ''}`} onClick={() => { setEditing(false); setSelected(d.id); }}><span className="fc-deck-icon"><Layers size={20}/></span><span><strong>{d.title}</strong><small>{d.subject || t('Custom subject', 'Maxsus fan')} · {(cards[d.id] || []).filter(c => !c.deleted).length} {t('cards', 'kartochka')}</small></span>{d.favorite && <Star size={15}/>}</button>)}</nav>{!libraryDecks.length && <p className="fc-muted">{t('Your decks will appear here.', 'To‘plamlaringiz shu yerda ko‘rinadi.')}</p>}</aside></details> : <aside className="fc-library"><div className="fc-section-heading"><h3>{t('My library', 'Kutubxonam')}</h3><span>{libraryDecks.length}</span></div><label className="fc-search"><Search size={17}/><input aria-label={t('Search decks', 'To‘plamlarni qidirish')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search decks, subjects, tags', 'To‘plam, fan, teg qidirish')}/></label><div className="fc-library-filters"><select aria-label={t('Library filter', 'Kutubxona filtri')} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t('All decks', 'Barcha to‘plamlar')}</option><option value="favorite">{t('Favorites', 'Sevimlilar')}</option><option value="archived">{t('Archived', 'Arxiv')}</option></select><select aria-label={t('Sort decks', 'Saralash')} value={sort} onChange={e => setSort(e.target.value)}><option value="recent">{t('Recent', 'So‘nggi')}</option><option value="title">{t('Title', 'Nomi')}</option></select></div><nav aria-label={t('Deck library', 'To‘plamlar kutubxonasi')}>{libraryDecks.map(d => <button key={d.id} className={`fc-deck-tile ${selected === d.id ? 'active' : ''}`} onClick={() => { setEditing(false); setSelected(d.id); }}><span className="fc-deck-icon"><Layers size={20}/></span><span><strong>{d.title}</strong><small>{d.subject || t('Custom subject', 'Maxsus fan')} · {(cards[d.id] || []).filter(c => !c.deleted).length} {t('cards', 'kartochka')}</small></span>{d.favorite && <Star size={15}/>}</button>)}</nav>{!libraryDecks.length && <p className="fc-muted">{t('Your decks will appear here.', 'To‘plamlaringiz shu yerda ko‘rinadi.')}</p>}</aside>}
    <main className="fc-deck-detail">{deck ? <>
      <div className="fc-deck-header"><div><span className="fc-eyebrow">{deck.subject || t('YOUR KNOWLEDGE', 'BILIMLARINGIZ')}</span><h3>{deck.title}</h3><p>{deck.description}</p></div><div><button className="fc-icon" aria-label={t('Favorite deck', 'Sevimli to‘plam')} aria-pressed={deck.favorite} onClick={() => action(() => store.saveDeck({ ...deck, favorite: !deck.favorite }))}><Star size={20}/></button><button className="fc-icon" aria-label={t('Archive deck', 'Arxivga olish')} aria-pressed={deck.archived} onClick={() => action(() => store.saveDeck({ ...deck, archived: !deck.archived }))}><Archive size={20}/></button></div></div>
      <details className="fc-import"><summary>{t('Deck details & tags', 'To‘plam tafsilotlari va teglar')}</summary><form key={deck.id} className="fc-advanced" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); action(() => store.saveDeck({ ...deck, title: String(form.get('title') || '').trim(), subject: String(form.get('subject') || '').trim(), description: String(form.get('description') || ''), tags: String(form.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean), updatedAt: new Date().toISOString() })); }}><label>{t('Title', 'Nomi')}<input name="title" defaultValue={deck.title} required maxLength={160}/></label><label>{t('Subject', 'Fan')}<input name="subject" defaultValue={deck.subject} maxLength={100}/></label><label>{t('Description', 'Izoh')}<textarea name="description" defaultValue={deck.description} maxLength={1000}/></label><label>{t('Tags (comma separated)', 'Teglar (vergul bilan)')}<input name="tags" defaultValue={deck.tags.join(', ')} maxLength={500}/></label><button className="fc-button" disabled={store.blocked}>{t('Save deck details', 'Tafsilotlarni saqlash')}</button></form></details>
      <div className="fc-deck-stats"><span><strong>{validCards.length}</strong>{t('cards', 'kartochka')}</span><span><strong>{dueCards.length}</strong>{t('due', 'takrorlash kerak')}</span><span><strong>{validCards.filter(c => store.getReview(c).reviewCount > 0).length}</strong>{t('reviewed at least once', 'kamida bir marta takrorlangan')}</span><span className="fc-save-status">{store.sync === 'synced' ? t('Cloud loaded', 'Bulutdan yuklandi') : store.sync === 'pending' ? t('Waiting for sync', 'Sinxronlash kutilmoqda') : store.sync === 'failed' ? t('Device copy · sync needs attention', 'Qurilmada · sinxronlash kerak') : t('Device copy', 'Qurilmadagi nusxa')}</span></div>
      {editing ? <Editor key={deck.id} uid={uid} deck={deck} cards={cards[deck.id] || []} uz={uz} save={rows => store.saveCards(deck.id, rows)} close={() => setEditing(false)}/> : <>
      <section className="fc-study-launch"><div className="fc-section-heading"><div><h4>{t('Learn your way', 'O‘zingizga mos usulda o‘rganing')}</h4><p className="fc-muted">{t('Recall first. Reveal when you’re ready.', 'Avval eslang. Tayyor bo‘lganda javobni oching.')}</p></div></div>{referenceAppearance && <ReferenceCardPreview cards={validCards} deckId={selected}/>}<div className="fc-mode-grid">{(['classic', 'match', 'type', 'missing', 'choice', 'listen', 'learn'] as Mode[]).map(m => <button className={`fc-mode ${mode === m ? 'active' : ''}`} aria-pressed={mode === m} key={m} onClick={() => setMode(m)}>{modeName(m, uz)}</button>)}</div><div className="fc-launch-options"><label><input type="checkbox" checked={shuffleOn} onChange={e => setShuffleOn(e.target.checked)}/>{t('Shuffle', 'Aralashtirish')}</label><label><input type="checkbox" checked={vocabulary} onChange={e => setVocabulary(e.target.checked)}/>{t('Vocabulary hints', 'Lug‘at yordamlari')}</label></div><div className="fc-launch-actions"><button className="fc-primary" onClick={() => start(false)} disabled={!validCards.length || store.blocked}>{t('Start studying', 'O‘rganishni boshlash')}<ArrowRight size={18}/></button><button className="fc-button" onClick={() => start(true)} disabled={!dueCards.length || store.blocked}>{t('Review due cards', 'Kerakli kartochkalarni takrorlash')} ({dueCards.length})</button>{resume && <button className="fc-button" onClick={() => setSession(resume)}>{t('Resume session', 'Mashg‘ulotni davom ettirish')}</button>}</div><p className="fc-muted fc-session-limit">{t('Match uses up to 6 distinct pairs; other sessions use up to 200 cards. Duplicate pairs are excluded from choice activities.', 'Juftlash 6 tagacha juftlik; boshqa mashg‘ulotlar 200 tagacha kartochka. Bir xil juftliklar tanlash mashqlaridan chiqariladi.')}</p></section>
      <div className="fc-section-heading fc-card-heading"><h4>{t('Cards', 'Kartochkalar')}</h4><div className="fc-row-actions"><button className="fc-button" onClick={() => setEditing(true)} disabled={store.blocked}><Plus size={17}/>{t('Edit & add cards', 'Tahrirlash va qo‘shish')}</button><button className="fc-button" onClick={() => download(deckCards, 'noviq-deck.json')}><Download size={17}/>{t('Export', 'Yuklash')}</button><button className="fc-button" onClick={() => { setScheduleOpen(v => !v); setPlanSubject(planner.plan?.subjects.find(s => s.name === deck.subject)?.id || planner.plan?.subjects[0]?.id || ''); setReviewDate(dateKey(Date.now(), planner.plan?.timezone || 'Asia/Tashkent')); }}><CalendarDays size={17}/>{t('Add to Planner', 'Plannerga qo‘shish')}</button></div></div>
      {scheduleOpen && <section className="fc-schedule"><h4>{t('Schedule one review', 'Bitta takrorlash rejalash')}</h4><p>{t('Adds a task with a 30-second-per-card estimate. Place it into your timetable in Planner.', 'Har kartochka uchun 30 soniya taxminli vazifa qo‘shiladi. Uni Plannerda jadvalga joylang.')}</p><label>{t('Planner subject', 'Planner fani')}<select value={planSubject} onChange={e => setPlanSubject(e.target.value)}><option value="">{t('Choose subject', 'Fan tanlang')}</option>{planner.plan?.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>{t('Review date', 'Takrorlash sanasi')}<input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)}/></label><button className="fc-primary" onClick={scheduleReview}>{t('Add review task', 'Takrorlash vazifasini qo‘shish')}</button></section>}
      <label className="fc-search"><Search size={17}/><input value={cardSearch} onChange={e => { setCardSearch(e.target.value); setPage(0); }} aria-label={t('Search cards', 'Kartochka qidirish')} placeholder={t('Find a card', 'Kartochka qidirish')}/></label>
      <div className="fc-card-list">{visible.slice(page * 30, (page + 1) * 30).map(c => <article className="fc-card-row" key={c.id}><div><strong>{c.front || t('Missing question — edit this card', 'Savol yo‘q — tahrirlang')}</strong>{c.translation && <small>{c.translation}</small>}</div><p>{c.back || t('Missing answer — edit this card', 'Javob yo‘q — tahrirlang')}</p><span className="fc-card-due">{due(store.getReview(c)) ? t('Due', 'Takrorlash kerak') : new Date(store.getReview(c).dueAt).toLocaleDateString(uz ? 'uz-UZ' : 'en-GB')}</span></article>)}</div>{visible.length > 30 && <div className="fc-pagination"><button className="fc-button" onClick={() => setPage(p => p - 1)} disabled={!page}>{t('Previous', 'Oldingi')}</button><span>{page + 1} / {Math.ceil(visible.length / 30)}</span><button className="fc-button" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 30 >= visible.length}>{t('Next', 'Keyingi')}</button></div>}{!deckCards.length && <div className="fc-empty"><Layers size={38}/><h4>{t('Your first card starts here.', 'Birinchi kartochkangiz shu yerdan boshlanadi.')}</h4><p>{t('Add questions manually or import a list in the editor.', 'Savollarni yozing yoki tahrirlashda ro‘yxat import qiling.')}</p><button className="fc-primary" onClick={() => setEditing(true)}>{t('Add cards', 'Kartochka qo‘shish')}</button></div>}
      </>}
    </> : <div className="fc-empty"><Layers size={42}/><h3>{t('Create your first deck', 'Birinchi to‘plamingizni yarating')}</h3><p>{t('Vocabulary, formulas, science, code — make space for everything you want to remember.', 'Lug‘at, formula, fan, dasturlash — eslab qolmoqchi bo‘lgan barcha bilimlar uchun.')}</p><button className="fc-primary" onClick={() => setCreate(true)} disabled={store.blocked}>{t('Create deck', 'To‘plam yaratish')}</button></div>}</main></div></>}
    {referenceAppearance && <details className="pro-library-insights"><summary>{t('Library insights', 'Kutubxona tahlili')}</summary><section className="fc-overview"><div><span className="fc-eyebrow">{t('YOUR NEXT SMALL WIN', 'KEYINGI KICHIK YUTUQ')}</span><h3>{allCards.length ? t('Keep what you learn.', 'O‘rganganingizni eslab qoling.') : t('A fresh start for your memory.', 'Xotirangiz uchun yangi boshlanish.')}</h3><p>{allCards.length ? `${allCards.filter(c => due(store.getReview(c))).length} ${t('cards ready for a little recall practice.', 'kartochka takrorlashga tayyor.')}` : t('Turn a word, question or concept into something you remember.', 'So‘z, savol yoki tushunchani esda qoladigan bilimga aylantiring.')}</p><button className="fc-link" onClick={() => deck ? start(true) : setCreate(true)}>{t('Start a review', 'Takrorlashni boshlash')}<ArrowRight size={18}/></button></div><div className="fc-overview-stat"><Layers size={28}/><strong>{allCards.length}</strong><span>{t('cards in your library', 'kutubxonadagi kartochkalar')}</span></div><div className="fc-overview-stat"><strong>{attempts.length ? `${Math.round(attempts.filter(a => a.correct).length / attempts.length * 100)}%` : '—'}</strong><span>{t('recent practice accuracy', 'so‘nggi mashq aniqligi')}</span><small>{attempts.length ? `${attempts.length} ${t('recorded attempts', 'saqlangan urinishlar')}` : t('Complete a session to see insights', 'Natija uchun mashg‘ulotni yakunlang')}</small></div></section></details>}
    {create && createPortal(<div className={`fc-modal-backdrop ${referenceAppearance ? 'fg-modal-backdrop' : ''}`}><div className="fc-modal" role="dialog" aria-modal="true" aria-labelledby="new-deck-title" ref={dialog} tabIndex={-1}><button className="fc-icon fc-modal-close" onClick={() => setCreate(false)} aria-label={t('Close deck form', 'To‘plam formasini yopish')}><X size={21}/></button><span className="fc-eyebrow">{t('A NEW COLLECTION', 'YANGI TO‘PLAM')}</span><h2 id="new-deck-title">{t('Create deck', 'To‘plam yaratish')}</h2><form onSubmit={createDeck}><label>{t('Deck title', 'To‘plam nomi')}<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)}/></label><label>{t('Subject (optional)', 'Fan (ixtiyoriy)')}<input maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} placeholder="IELTS, Biology, HSK…"/></label><label>{t('Description (optional)', 'Izoh (ixtiyoriy)')}<textarea maxLength={1000} value={description} onChange={e => setDescription(e.target.value)}/></label><button className="fc-primary" disabled={!title.trim()}>{t('Create & add cards', 'Yaratish va kartochka qo‘shish')}</button></form></div></div>, document.body)}
    {session && <Study key={session.id} cards={cards[session.deckId] || []} session={session} uz={uz} vocabulary={vocabulary} getReview={store.getReview} save={saveStudy} close={() => setSession(null)} complete={finish}/>}
  </div>;
}
