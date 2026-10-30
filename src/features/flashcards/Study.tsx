import { useRecallRewards } from '@/src/features/progression/useRecallRewards';
import {useMembership} from '@/src/features/pro/MembershipContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Lightbulb, Volume2, RotateCcw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/src/lib/useDialogFocus';
import { useBodyScrollLock } from '@/src/lib/useBodyScrollLock';
import { hintsFor, matchesAnswer, missingPattern, uniquePairs, shuffle, schedule, appendAttempt, type Card, type Review, type Session, type Rating, type Mode } from './model';
type Props = {
    cards: Card[];
    session: Session;
    uz: boolean;
    vocabulary: boolean;
    getReview: (c: Card) => Review;
    save: (s: Session, r?: Review) => void;
    close: () => void;
    complete: (s: Session) => void;
};
const names: Record<Mode, [
    string,
    string
]> = { classic: ['Flashcards', 'Kartochkalar'], match: ['Match', 'Juftlash'], type: ['Type answer', 'Javob yozish'], missing: ['Missing letters', 'Tushirilgan harflar'], choice: ['Multiple choice', 'Variant tanlash'], listen: ['Listen & spell', 'Tinglash va yozish'], learn: ['Smart Learn', 'Aqlli o‘rganish'] };
export const modeName = (mode: Mode, uz: boolean) => names[mode][uz ? 1 : 0];
export function Study({ cards, session: initial, uz, vocabulary, getReview, save, close, complete }: Props) {
    const {cinematic} = useMembership();
    const rewards = useRecallRewards(initial);
    const t = (en: string, u: string) => uz ? u : en;
    const [session, setSession] = useState(initial), [flipped, setFlipped] = useState(false), [answer, setAnswer] = useState(''), [result, setResult] = useState<boolean | null>(null), [hintCount, setHintCount] = useState(0), [error, setError] = useState('');
    const [strict, setStrict] = useState(false), [caseSensitive, setCaseSensitive] = useState(!vocabulary), [level, setLevel] = useState<'easy' | 'medium' | 'hard'>('medium'), [reverse, setReverse] = useState(false);
    const [left, setLeft] = useState(''), [matched, setMatched] = useState<string[]>(initial.attempts.map(a => a.cardId)), [mistakes, setMistakes] = useState(0);
    const dialog = useRef<HTMLDivElement>(null), elapsed = useRef(initial.activeSeconds), busy = useRef(false), sessionRef = useRef(session);
    sessionRef.current = session;
    const selected = session.cardIds.map(id => cards.find(c => c.id === id)).filter((c): c is Card => !!c && !c.deleted && !!c.front && !!c.back);
    const c = selected[session.index];
    const review = c ? getReview(c) : null;
    const mode: Mode = session.mode === 'learn' ? (review?.reviewCount === 0 && uniquePairs(cards).length >= 2 ? 'choice' : 'type') : session.mode;
    const hintList = c ? hintsFor(c, vocabulary, uz) : [];
    const options = useMemo(() => c ? shuffle([c, ...shuffle(uniquePairs(cards).filter(x => x.id !== c.id && x.back !== c.back)).slice(0, 3)]) : [], [c?.id, mode]);
    const right = useMemo(() => shuffle(selected), [session.id]);
    const pairHints = left ? cards.find(c => c.id === left) : c;
    const pause = () => { try {
        save({ ...sessionRef.current, activeSeconds: elapsed.current });
        close();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
    } };
    useBodyScrollLock(true);
    useDialogFocus(true, dialog, pause);
    useEffect(() => { const root = document.getElementById('root'); if (!root)
        return; const before = root.inert; root.inert = true; return () => { root.inert = before; }; }, []);
    useEffect(() => { const timer = setInterval(() => { if (!document.hidden && document.hasFocus() && !sessionRef.current.completed)
        elapsed.current++; }, 1000); return () => clearInterval(timer); }, []);
    useEffect(() => { const hide = () => { if (document.hidden && !sessionRef.current.completed) {
        try {
            save({ ...sessionRef.current, activeSeconds: elapsed.current });
        }
        catch (e) {
            setError(String(e));
        }
    } }; document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide); }, [save]);
    useEffect(() => { setFlipped(false); setAnswer(''); setResult(null); setHintCount(0); setError(''); }, [session.index]);
    const record = (card: Card, rating: Rating, correct: boolean, input = answer, hints = hintCount, advance = true) => {
        if (busy.current || session.completed)
            return;
        busy.current = true;
        try {
            const next = appendAttempt(sessionRef.current, { cardId: card.id, mode: session.mode, answer: input, correct, hints, rating, at: new Date().toISOString(), revision: card.revision, ...(mode === 'match' ? { mistakes } : {}) }, elapsed.current, advance);
            if (!next)
                return;
            // Match/choice recognition never advances recall confidence like unaided typing.
            const assisted = hints + (['match', 'choice'].includes(mode) ? 1 : 0);
            save(next, schedule(getReview(card), rating, assisted));
            rewards.record(next.attempts[next.attempts.length - 1]);
            sessionRef.current = next;
            setSession(next);
            if (next.completed)
                complete(next);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed');
        }
        finally {
            busy.current = false;
        }
    };
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"],button:not(.fc-flashcard),a,summary') || e.ctrlKey || e.metaKey || e.altKey)
                return;
            if (mode === 'classic' && (e.key === ' ' || e.key === 'Enter')) {
                e.preventDefault();
                setFlipped(v => !v);
            }
            if (e.key.toLowerCase() === 'h') {
                e.preventDefault();
                setHintCount(n => Math.min(n + 1, hintList.length));
            }
            if (mode === 'classic' && flipped && c) {
                const ratings: Record<string, Rating> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
                if (ratings[e.key])
                    record(c, ratings[e.key], e.key !== '1');
            }
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [mode, flipped, c, session, hintCount]);
    const check = () => { if (!c || result !== null)
        return; setResult(matchesAnswer(answer, c.front, c.alternateAnswers, strict, caseSensitive)); };
    const speak = () => { if (!c || !('speechSynthesis' in window))
        return; speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(c.front); utterance.lang = typeof c.language === 'string' ? c.language : 'en-US'; utterance.onerror = () => setError(t('Pronunciation playback is unavailable. Try the typing mode.', 'Talaffuzni tinglab bo‘lmaydi. Yozish rejimini sinang.')); speechSynthesis.speak(utterance); };
    useEffect(() => () => { if ('speechSynthesis' in window)
        speechSynthesis.cancel(); }, []);
    const choosePair = (id: string) => {
        if (!left || matched.includes(id))
            return;
        if (id !== left) {
            setMistakes(n => n + 1);
            setError(t('These do not match. Try again.', 'Bu juftlik mos emas. Qayta urinib ko‘ring.'));
            return;
        }
        const card = cards.find(c => c.id === id)!;
        record(card, mistakes ? 'hard' : 'good', mistakes === 0, card.back, hintCount, false);
        setMatched(m => [...m, id]);
        setLeft('');
        setMistakes(0);
        setHintCount(0);
        setError('');
    };
    return createPortal(<div data-pro-portal={cinematic ? "study" : undefined} className={`fc-study-backdrop ${document.querySelector('.noviq-app.dark') ? 'dark' : ''} ${cinematic ? 'pro-study' : ''}`}><div className="fc-study" role="dialog" aria-modal="true" aria-label={modeName(session.mode, uz)} ref={dialog} tabIndex={-1}>
    <header className="fc-study-header"><button onClick={pause} className="fc-button"><ArrowLeft size={18}/>{t('Save & exit', 'Saqlash va chiqish')}</button><div><strong>{modeName(session.mode, uz)}</strong><p>{session.attempts.length} / {selected.length} {t('reviewed', 'takrorlandi')}</p></div><button className="fc-button" onClick={() => setHintCount(n => Math.min(n + 1, mode === 'match' ? 3 : hintList.length))} disabled={session.completed} aria-label={t('Show hint', 'Yordam ko‘rsatish')}><Lightbulb size={20}/>{t('Hint', 'Yordam')}</button></header>
    <progress max={Math.max(1, selected.length)} value={session.attempts.length} aria-label={t('Session progress', 'Mashg‘ulot jarayoni')}/>
    <div className="fc-study-content">
      {error && <p role="alert" className="fc-feedback">{error}</p>}
      {session.completed ? <section className="fc-results"><span className="fc-eyebrow">{t('SESSION COMPLETE', 'MASHG‘ULOT TUGADI')}</span><h2>{t('A little stronger, every review.', 'Har takrorlash bilan bilim mustahkamlanadi.')}</h2><p>{session.attempts.filter(a => a.correct).length} / {session.attempts.length} {t('correct', 'to‘g‘ri')} · {session.attempts.filter(a => a.hints > 0).length} {t('assisted', 'yordam bilan')} · {Math.ceil(elapsed.current / 60)} {t('active minutes', 'faol daqiqa')}</p><p>{t('Practice accuracy is not a long-term retention estimate.', 'Mashq aniqligi uzoq muddatli eslab qolish bahosi emas.')}</p><button className="fc-primary" onClick={close}>{t('Back to deck', 'To‘plamga qaytish')}</button></section> : mode === 'match' ? <>
        <p className="fc-muted">{t('Select a question, then its answer. Correct pairs are marked ✓.', 'Savolni, keyin unga mos javobni tanlang. To‘g‘ri juftliklar ✓ bilan belgilanadi.')}</p>
        {hintCount > 0 && <p role="status" className="fc-hint">{pairHints ? hintsFor(pairHints, vocabulary, uz).slice(0, hintCount).join(' · ') : t('Select a question first.', 'Avval savol tanlang.')}</p>}
        <div className="fc-match"><div>{selected.map(card => <button key={card.id} className={`fc-match-item ${left === card.id ? 'selected' : ''}`} onClick={() => { setLeft(card.id); setHintCount(0); }} disabled={matched.includes(card.id)}>{matched.includes(card.id) ? '✓ ' : ''}{card.front}</button>)}</div><div>{right.map(card => <button key={card.id} className="fc-match-item" onClick={() => choosePair(card.id)} disabled={matched.includes(card.id)}>{matched.includes(card.id) ? '✓ ' : ''}{card.back}</button>)}</div></div>
      </> : c ? <>
        <details className="fc-study-options"><summary>{t('Study options', 'Mashg‘ulot sozlamalari')}</summary><div className="fc-study-settings">{mode === 'classic' ? <label><input type="checkbox" checked={reverse} onChange={e => { setReverse(e.target.checked); setFlipped(false); }}/>{t('Reverse sides', 'Tomonlarni almashtirish')}</label> : <label><input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)}/>{t('Strict punctuation', 'Tinish belgilarini aniq tekshirish')}</label>}{mode !== 'classic' && <label><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)}/>{t('Case-sensitive answers', 'Katta-kichik harfni tekshirish')}</label>}{mode === 'missing' && <label>{t('Difficulty', 'Qiyinlik')}<select value={level} onChange={e => setLevel(e.target.value as typeof level)}><option value="easy">{t('Easy', 'Oson')}</option><option value="medium">{t('Medium', 'O‘rtacha')}</option><option value="hard">{t('Hard', 'Qiyin')}</option></select></label>}</div></details>
        {mode === 'classic' ? <button type="button" className={`fc-flashcard ${flipped ? 'revealed' : ''}`} onClick={() => setFlipped(v => !v)} aria-label={t('Flip card', 'Kartochkani aylantirish')}><span className="fc-flip-inner"><span className="fc-flip-face fc-flip-front" aria-hidden={flipped}><span className="fc-eyebrow">{t('RECALL FIRST','AVVAL ESLANG')}</span>{c.imageUrl&&<img src={c.imageUrl} alt={t('Card reference image','Kartochka uchun rasm')}/>}<span className="fc-card-text">{reverse?c.back:c.front}</span></span><span className="fc-flip-face fc-flip-back" aria-hidden={!flipped}><span className="fc-eyebrow">{t('ANSWER','JAVOB')}</span><span className="fc-card-text">{reverse?c.front:c.back}</span></span></span><span className="fc-muted">{t('Space or Enter to flip','Aylantirish uchun Space yoki Enter')}</span></button> : <section className="fc-flashcard"><span className="fc-eyebrow">{mode === 'choice' ? t('CHOOSE THE ANSWER', 'JAVOBNI TANLANG') : t('RETRIEVE THE TERM', 'ATAMANI ESLANG')}</span>{mode === 'listen' ? <button className="fc-primary" onClick={speak} disabled={!('speechSynthesis' in window)}><Volume2 size={22}/>{t('Play pronunciation', 'Talaffuzni tinglash')}</button> : <div className="fc-card-text">{mode === 'choice' ? c.front : c.back}</div>}{mode === 'missing' && <p className="fc-pattern" aria-label={t('Letter pattern', 'Harf namunasi')}>{missingPattern(c.front, level)}</p>}</section>}
        {hintCount > 0 && <aside className="fc-hint" role="status">{hintList.slice(0, hintCount).map(h => <p key={h}>{h}</p>)}</aside>}
        {mode === 'classic' ? flipped && <div className="fc-rating">{(['again', 'hard', 'good', 'easy'] as Rating[]).map((r, i) => <button key={r} className="fc-button" onClick={() => record(c, r, r !== 'again')}>{[t('Again', 'Yana'), t('Hard', 'Qiyin'), t('Good', 'Yaxshi'), t('Easy', 'Oson')][i]} <small>{i + 1}</small></button>)}</div> : mode === 'choice' ? <div className="fc-choices">{options.length < 2 ? <p>{t('Add at least two distinct pairs for this mode.', 'Bu rejim uchun kamida ikkita turli juftlik qo‘shing.')}</p> : options.map(option => <button className="fc-button" key={option.id} disabled={result !== null} onClick={() => { setAnswer(option.back); setResult(option.id === c.id); }}>{option.back}</button>)}</div> : <form className="fc-answer" onSubmit={e => { e.preventDefault(); check(); }}><label htmlFor="recall-answer">{t('Your answer', 'Javobingiz')}</label><input id="recall-answer" autoComplete="off" value={answer} onChange={e => setAnswer(e.target.value)} disabled={result !== null}/><button className="fc-primary" disabled={!answer.trim() || result !== null}>{t('Check answer', 'Javobni tekshirish')}</button><small>{t('Case and spacing are normalized. Only saved answers and approved alternatives count.', 'Katta-kichik harflar va bo‘shliqlar hisobga olinmaydi. Faqat saqlangan javoblar va muqobillar qabul qilinadi.')}</small></form>}
        {result !== null && <div className="fc-feedback" role="status"><strong>{result ? t('✓ Correct', '✓ To‘g‘ri') : t('Keep practicing', 'Mashqni davom ettiring')}</strong>{!result && <p>{t('Answer', 'Javob')}: {mode === 'choice' ? c.back : c.front}</p>}<button className="fc-primary" onClick={() => record(c, result ? 'good' : 'again', result)}>{t('Continue', 'Davom etish')}</button>{!result && <button className="fc-button" onClick={() => record(c, 'hard', true)}>{t('Accept my answer manually', 'Javobimni qo‘lda qabul qilish')}</button>}</div>}
      </> : <p role="alert">{t('This card was removed or changed. Save and exit to start a new session.', 'Kartochka o‘zgartirilgan. Chiqib, yangi mashg‘ulotni boshlang.')}</p>}
    </div>
    <footer className="fc-study-footer"><span>{t('Hints make the next review sooner. Take your time; this is not a race.', 'Yordam ishlatilsa, keyingi takrorlash ertaroq bo‘ladi. Shoshilmang.')}</span>{!session.completed && <button className="fc-button" onClick={() => { setAnswer(''); setResult(null); setFlipped(false); }}><RotateCcw size={16}/>{t('Try again', 'Qayta urinish')}</button>}</footer>
  </div></div>, document.body);
}
