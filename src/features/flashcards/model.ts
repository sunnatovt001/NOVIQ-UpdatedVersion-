export type Deck = {
    id: string;
    title: string;
    description: string;
    subject: string;
    tags: string[];
    favorite: boolean;
    archived: boolean;
    updatedAt: string;
    [key: string]: unknown;
};
export type Card = {
    id: string;
    deckId: string;
    front: string;
    back: string;
    translation: string;
    example: string;
    pronunciation: string;
    partOfSpeech: string;
    hint: string;
    imageUrl: string;
    source: string;
    alternateAnswers: string[];
    order: number;
    revision: number;
    deleted: boolean;
    favorite: boolean;
    [key: string]: unknown;
};
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type Review = {
    id: string;
    dueAt: string;
    interval: number;
    ease: number;
    repetitions: number;
    lapses: number;
    reviewCount: number;
    revision: number;
};
export type Mode = 'classic' | 'match' | 'type' | 'missing' | 'choice' | 'listen' | 'learn';
export type Attempt = {
    cardId: string;
    mode: Mode;
    answer: string;
    correct: boolean;
    hints: number;
    rating: Rating;
    at: string;
    revision: number;
    mistakes?: number;
};
export type Session = {
    id: string;
    deckId: string;
    mode: Mode;
    cardIds: string[];
    index: number;
    attempts: Attempt[];
    startedAt: string;
    activeSeconds: number;
    completed: boolean;
    taskId?: string;
};
export function appendAttempt(session: Session, attempt: Attempt, activeSeconds: number, advance = true): Session | null {
    if (session.completed || session.attempts.some(a => a.cardId === attempt.cardId) || !session.cardIds.includes(attempt.cardId))
        return null;
    const attempts = [...session.attempts, attempt], index = advance ? session.index + 1 : session.index;
    return { ...session, attempts, index, activeSeconds, completed: attempts.length >= session.cardIds.length };
}
export function validSession(raw: unknown): raw is Session {
    const s = raw as Session, modes = ['classic', 'match', 'type', 'missing', 'choice', 'listen', 'learn'];
    return !!s && typeof s.id === 'string' && typeof s.deckId === 'string' && modes.includes(s.mode) && typeof s.startedAt === 'string' && Number.isFinite(Date.parse(s.startedAt)) && Array.isArray(s.cardIds) && s.cardIds.length <= 200 && s.cardIds.every(id => typeof id === 'string') && Array.isArray(s.attempts) && s.attempts.length <= s.cardIds.length && s.attempts.every(a => !!a && typeof a.cardId === 'string' && s.cardIds.includes(a.cardId) && typeof a.correct === 'boolean' && Number.isFinite(a.hints) && a.hints >= 0 && typeof a.answer === 'string' && modes.includes(a.mode) && ['again', 'hard', 'good', 'easy'].includes(a.rating)) && typeof s.completed === 'boolean' && Number.isInteger(s.index) && s.index >= 0 && s.index <= s.cardIds.length && Number.isFinite(s.activeSeconds) && s.activeSeconds >= 0;
}
const text = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const strings = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
const finite = (v: unknown, fallback = 0) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
export const normalizeAnswer = (s: string, strict = false) => s.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase().replace(/[‘’ʻʼ`]/gu, "'").replace(strict ? /$^/u : /[.,!?;:]+$/u, '');
export function matchesAnswer(input: string, answer: string, alternatives: string[] = [], strict = false, caseSensitive = false) {
    const normalize = (s: string) => caseSensitive ? s.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/[‘’ʻʼ`]/gu, "'").replace(strict ? /$^/u : /[.,!?;:]+$/u, '') : normalizeAnswer(s, strict);
    const value = normalize(input);
    return !!value && [answer, ...alternatives].some(a => normalize(a) === value);
}
export function normalizeDeck(raw: unknown, id: string): Deck {
    const d = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return { ...d, id, title: text(d.title) || 'Untitled deck', description: text(d.description), subject: text(d.subject), tags: strings(d.tags), favorite: d.favorite === true, archived: d.archived === true, updatedAt: text(d.updatedAt) };
}
export function normalizeCard(raw: unknown, id: string, deckId: string): Card {
    const c = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    return { ...c, id, deckId, front: text(c.front ?? c.question ?? c.term), back: text(c.back ?? c.answer ?? c.definition), translation: text(c.translation), example: text(c.example), pronunciation: text(c.pronunciation), partOfSpeech: text(c.partOfSpeech), hint: text(c.hint), imageUrl: safeImage(text(c.imageUrl)), source: text(c.source), alternateAnswers: strings(c.alternateAnswers), order: finite(c.order), revision: finite(c.revision, 1), deleted: c.deleted === true, favorite: c.favorite === true };
}
export function safeImage(url: string) { try {
    const u = new URL(url);
    return u.protocol === 'https:' ? url : '';
}
catch {
    return '';
} }
export function normalizeReview(raw: unknown, card: Card): Review {
    const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : card;
    const due = text(r.dueAt);
    return { id: card.id, dueAt: Number.isFinite(Date.parse(due)) ? due : new Date(0).toISOString(), interval: finite(r.interval), ease: Math.max(1.3, Math.min(3.2, finite(r.ease ?? r.easeFactor, 2.5))), repetitions: finite(r.repetitions ?? r.repetition), lapses: finite(r.lapses), reviewCount: finite(r.reviewCount), revision: finite(r.revision, card.revision) };
}
export const due = (r: Review, now = Date.now()) => Date.parse(r.dueAt) <= now;
// Transparent SM-2-style schedule. Recognition and assisted answers are capped at Hard.
export function schedule(r: Review, rating: Rating, hints = 0, now = Date.now()): Review {
    const grade = hints > 0 && ['good', 'easy'].includes(rating) ? 'hard' : rating;
    const interval = grade === 'again' ? 0 : grade === 'hard' ? Math.max(1, Math.round(r.interval * 1.2)) : grade === 'easy' ? Math.max(4, Math.round(r.interval * (r.ease + .3))) : r.repetitions === 0 ? 1 : r.repetitions === 1 ? 6 : Math.max(1, Math.round(r.interval * r.ease));
    return { ...r, interval, ease: Math.max(1.3, Math.min(3.2, r.ease + (grade === 'again' ? -.2 : grade === 'hard' ? -.15 : grade === 'easy' ? .15 : 0))), repetitions: grade === 'again' ? 0 : r.repetitions + 1, lapses: r.lapses + (grade === 'again' ? 1 : 0), reviewCount: r.reviewCount + 1, dueAt: new Date(now + (grade === 'again' ? 600000 : interval * 86400000)).toISOString() };
}
export function hintsFor(c: Card, vocabulary = true, uz = false) {
    const letters = Array.from(c.front.normalize('NFC'));
    if (!vocabulary)
        return [c.hint || (uz ? 'Asosiy tushunchani eslang.' : 'Recall the underlying concept.'), c.example || (uz ? 'Qanday shartlarda qo‘llanadi?' : 'Under what conditions does this apply?')];
    const hints = [c.hint, letters.length > 1 ? `${uz ? 'Birinchi harf' : 'Starts with'}: ${letters[0] || ''}` : '', `${letters.filter(x => /[\p{L}\p{N}]/u.test(x)).length} ${uz ? 'harf' : 'letters'}`, c.partOfSpeech, c.example].filter(Boolean);
    const escaped = c.front.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...new Set(hints)].filter(h => normalizeAnswer(h) !== normalizeAnswer(c.front)).map(h => escaped && letters.length > 1 ? h.replace(new RegExp(escaped, 'giu'), '…') : h);
}
export function missingPattern(answer: string, level: 'easy' | 'medium' | 'hard' = 'medium') {
    const chars = Array.from(answer.normalize('NFC'));
    const step = level === 'easy' ? 2 : level === 'medium' ? 3 : Infinity;
    return chars.map((ch, i) => !/[\p{L}\p{N}]/u.test(ch) || i === 0 && chars.length > 1 || chars.length > 2 && i % step === 0 ? ch : '_').join(' ');
}
export function uniquePairs(cards: Card[]) {
    const fronts = new Set<string>(), backs = new Set<string>();
    return cards.filter(c => { const f = normalizeAnswer(c.front), b = normalizeAnswer(c.back); if (!f || !b || fronts.has(f) || backs.has(b))
        return false; fronts.add(f); backs.add(b); return true; });
}
export function shuffle<T>(items: T[]): T[] { const a = [...items]; for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
export function parseSuggestions(raw: string): Pick<Card, 'front' | 'back' | 'translation' | 'example' | 'pronunciation' | 'partOfSpeech' | 'hint'>[] {
    const value = JSON.parse(raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
    const items = Array.isArray(value) ? value : [value];
    if (!items.length || items.length > 100)
        throw new Error('Invalid AI response');
    return items.map(v => { if (!v || typeof v.front !== 'string' || typeof v.back !== 'string' || !v.front.trim() || !v.back.trim() || v.back.length > 10000)
        throw new Error('Invalid AI response'); const c = normalizeCard(v, '', ''); return { front: c.front, back: c.back, translation: c.translation, example: c.example, pronunciation: c.pronunciation, partOfSpeech: c.partOfSpeech, hint: c.hint }; });
}
export function parseImport(text: string): {
    rows: {
        front: string;
        back: string;
    }[];
    errors: string[];
} {
    if (text.length > 1000000)
        throw new Error('Import exceeds 1 MB');
    const trimmed = text.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const data = JSON.parse(trimmed);
        const list = Array.isArray(data) ? data : data.cards;
        if (!Array.isArray(list))
            throw new Error('Expected cards array');
        return validateRows(list.map(c => [c?.front ?? c?.question, c?.back ?? c?.answer]));
    }
    const delimiter = text.includes('\t') ? '\t' : text.includes(' — ') ? ' — ' : ',';
    const rows: string[][] = [];
    let row: string[] = [], cell = '', quote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' && (quote || !cell)) {
            if (quote && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else
                quote = !quote;
        }
        else if (!quote && text.slice(i, i + delimiter.length) === delimiter) {
            row.push(cell);
            cell = '';
            i += delimiter.length - 1;
        }
        else if (!quote && ch === '\n') {
            row.push(cell.replace(/\r$/, ''));
            rows.push(row);
            row = [];
            cell = '';
        }
        else
            cell += ch;
    }
    row.push(cell.replace(/\r$/, ''));
    if (row.some(Boolean))
        rows.push(row);
    if (quote)
        throw new Error('Unclosed quoted field');
    if (rows[0]?.[0]?.toLowerCase() === 'front' && rows[0]?.[1]?.toLowerCase() === 'back')
        rows.shift();
    return validateRows(rows);
}
function validateRows(rows: unknown[][]) { if (rows.length > 2000)
    throw new Error('Maximum 2,000 cards per import'); const errors: string[] = []; const result: {
    front: string;
    back: string;
}[] = []; rows.forEach((r, i) => { if (r.length !== 2 || !text(r[0]).trim() || !text(r[1]).trim())
    errors.push(`Row ${i + 1}: provide exactly two nonempty fields.`);
else
    result.push({ front: text(r[0]).trim(), back: text(r[1]).trim() }); }); return { rows: result, errors }; }
export const cardValid = (c: Card) => c.front.trim().length > 0 && c.back.trim().length > 0 && c.front.length <= 10000 && c.back.length <= 20000;
export const emptyCard = (deckId: string, order = 0): Card => normalizeCard({ order, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, crypto.randomUUID(), deckId);
