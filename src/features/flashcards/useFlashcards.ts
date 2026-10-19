import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { loadLocalDataStrict, saveLocalData } from '@/src/lib/localStore';
import { getQueuedOperation, writeDocWithQueue, flushOfflineSyncQueue } from '@/src/lib/offlineSync';
import { isReadOnlyAudit } from '@/src/lib/auditMode';
import { normalizeCard, normalizeDeck, normalizeReview, cardValid, validSession, type Deck, type Card, type Review, type Session } from './model';
type Library = {
    decks: Deck[];
    cards: Record<string, Card[]>;
    reviews: Record<string, Record<string, Review>>;
    sessions: Session[];
};
const fresh = (): Library => ({ decks: [], cards: {}, reviews: {}, sessions: [] });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function useFlashcards(uid: string) {
    const key = `noviq:${uid}:flashcards:v2`;
    const [library, setLibrary] = useState<Library>(fresh);
    const current = useRef(library);
    const [message, setMessage] = useState('');
    const [blocked, setBlocked] = useState(false);
    const [ready, setReady] = useState(false);
    const [sync, setSync] = useState<'synced' | 'pending' | 'failed' | 'device'>('device');
    const [retry, setRetry] = useState(0);
    const active = useRef(true);
    const dirty = useRef(new Set<string>());
    const update = (fn: (l: Library) => Library, persist = true) => {
        const next = fn(current.current);
        if (persist)
            saveLocalData(key, next);
        current.current = next;
        setLibrary(next);
    };
    useEffect(() => {
        active.current = true;
        let live = true;
        try {
            const stored = loadLocalDataStrict<Library | null>(key, null);
            const legacyDecks = stored?.decks ?? loadLocalDataStrict<unknown>(`noviq:${uid}:decks`, []);
            const legacyCards = stored?.cards ?? loadLocalDataStrict<unknown>(`noviq:${uid}:cardsByDeck`, {});
            if (!Array.isArray(legacyDecks) || !record(legacyCards) || stored && (!record(stored.reviews) || !Array.isArray(stored.sessions) || !stored.sessions.every(validSession)))
                throw new Error('Unreadable saved library');
            const decks = legacyDecks.map(d => { if (!record(d) || typeof d.id !== 'string')
                throw new Error('Unreadable saved deck'); return normalizeDeck(d, d.id); });
            const cards: Record<string, Card[]> = {};
            for (const [id, list] of Object.entries(legacyCards)) {
                if (!Array.isArray(list))
                    throw new Error('Unreadable saved cards');
                cards[id] = list.map(c => { if (!record(c) || typeof c.id !== 'string')
                    throw new Error('Unreadable saved card'); return normalizeCard(c, c.id, id); });
            }
            update(() => ({ decks, cards, reviews: stored?.reviews ?? {}, sessions: stored?.sessions ?? [] }), false);
            setBlocked(false);
            setReady(true);
        }
        catch {
            setBlocked(true);
            setReady(true);
            setMessage('Saved data could not be read. It has been preserved. Export a backup before changing this browser’s storage.');
            return;
        }
        const unsubscribers = new Map<string, () => void>();
        const merge = <T extends {
            id: string;
        }>(old: T[], remote: T[], path: (id: string) => string[]) => {
            const pending = old.filter(x => dirty.current.has(path(x.id).join('/')) || (() => { const q = getQueuedOperation('set', path(x.id)); const legacy = x as T & {
                syncStatus?: string;
            }; return q ? q.status !== 'synced' : x.id.includes('-local-') || ['pending', 'failed'].includes(legacy.syncStatus || ''); })());
            return [...pending, ...remote.filter(x => !pending.some(p => p.id === x.id))];
        };
        const failure = () => { if (live) {
            setSync('failed');
            setMessage('Cloud connection needs attention. Your saved device data is available. Retry when ready.');
        } };
        const observeDeck = (id: string) => {
            if (unsubscribers.has(id))
                return;
            const cardPath = (cardId: string) => ['users', uid, 'decks', id, 'cards', cardId];
            const stopCards = onSnapshot(collection(db, 'users', uid, 'decks', id, 'cards'), snapshot => {
                if (!live)
                    return;
                try {
                    update(l => ({ ...l, cards: { ...l.cards, [id]: merge(l.cards[id] || [], snapshot.docs.map(d => normalizeCard(d.data(), d.id, id)), cardPath) } }));
                }
                catch {
                    failure();
                }
            }, failure);
            const stopReviews = onSnapshot(collection(db, 'users', uid, 'decks', id, 'reviews'), snapshot => {
                if (!live)
                    return;
                try {
                    update(l => { const rows = snapshot.docs.map(d => { const c = l.cards[id]?.find(c => c.id === d.id); return normalizeReview(d.data(), c ?? normalizeCard({}, d.id, id)); }); const old = Object.values(l.reviews[id] || {}); return { ...l, reviews: { ...l.reviews, [id]: Object.fromEntries(merge(old, rows, cardId => ['users', uid, 'decks', id, 'reviews', cardId]).map(r => [r.id, r])) } }; });
                }
                catch {
                    failure();
                }
            }, failure);
            unsubscribers.set(id, () => { stopCards(); stopReviews(); });
        };
        current.current.decks.forEach(d => observeDeck(d.id));
        const stop = onSnapshot(collection(db, 'users', uid, 'decks'), snapshot => {
            if (!live)
                return;
            try {
                const remote = snapshot.docs.map(d => normalizeDeck(d.data(), d.id));
                update(l => ({ ...l, decks: merge(l.decks, remote, id => ['users', uid, 'decks', id]) }));
                current.current.decks.forEach(d => observeDeck(d.id));
                setSync('synced');
            }
            catch {
                failure();
            }
        }, failure);
        const stopSessions = onSnapshot(query(collection(db, 'users', uid, 'flashcardSessions'), orderBy('startedAt', 'desc'), limit(30)), snapshot => {
            if (!live)
                return;
            try {
                update(l => ({ ...l, sessions: merge(l.sessions, snapshot.docs.map(d => ({ ...d.data(), id: d.id })).filter(validSession), id => ['users', uid, 'flashcardSessions', id]) }));
            }
            catch {
                failure();
            }
        }, failure);
        const onStorage = (event: StorageEvent) => { if (event.key === key) {
            setBlocked(true);
            setMessage('This library changed in another tab. Reload before editing to protect both versions.');
        } };
        window.addEventListener('storage', onStorage);
        return () => { live = false; active.current = false; stop(); stopSessions(); unsubscribers.forEach(stop => stop()); window.removeEventListener('storage', onStorage); };
    }, [uid, key, retry]);
    const write = (path: string[], data: unknown) => {
        dirty.current.add(path.join('/'));
        setSync('pending');
        if (isReadOnlyAudit) {
            dirty.current.delete(path.join('/'));
            setSync('device');
            return;
        }
        void writeDocWithQueue({ userId: uid, path, data: clone(data) as Record<string, unknown>, merge: true }).then(status => {
            if (active.current) {
                dirty.current.delete(path.join('/'));
                setSync(status);
                if (status === 'failed')
                    setMessage('Saved on this device. Cloud sync failed; use Retry sync.');
            }
        }).catch(() => { if (active.current) {
            setSync('failed');
            setMessage('Saved on this device. Cloud sync could not be queued. Keep this browser’s data and retry.');
        } });
    };
    const safe = (fn: () => void) => { if (blocked || !ready)
        throw new Error('Library is not ready'); if (isReadOnlyAudit)
        throw new Error('Saving is disabled in read-only audit mode.'); fn(); };
    const saveDeck = (deck: Deck) => safe(() => { if (!deck.title.trim() || deck.title.length > 160)
        throw new Error('Enter a deck title (maximum 160 characters).'); update(l => ({ ...l, decks: [deck, ...l.decks.filter(d => d.id !== deck.id)] })); write(['users', uid, 'decks', deck.id], deck); setRetry(n => n + 1); });
    const saveCards = (deckId: string, cards: Card[]) => safe(() => {
        if (cards.some(c => !c.deleted && !cardValid(c)))
            throw new Error('Every card needs a front and back');
        const prepared = cards.map(c => { const old = current.current.cards[deckId]?.find(x => x.id === c.id); const reset = old && old.revision !== c.revision; return { ...c, updatedAt: new Date().toISOString(), ...(!old || reset ? { dueAt: new Date().toISOString(), reviewCount: 0, interval: 0, easeFactor: 2.5, repetition: 0, lapses: 0 } : {}) }; });
        update(l => ({ ...l, cards: { ...l.cards, [deckId]: [...prepared, ...(l.cards[deckId] || []).filter(c => !prepared.some(n => n.id === c.id))] } }));
        prepared.forEach(c => write(['users', uid, 'decks', deckId, 'cards', c.id], c));
    });
    const saveReview = (deckId: string, r: Review) => safe(() => { update(l => ({ ...l, reviews: { ...l.reviews, [deckId]: { ...l.reviews[deckId], [r.id]: r } } })); write(['users', uid, 'decks', deckId, 'reviews', r.id], r); });
    const saveSession = (session: Session) => safe(() => { update(l => ({ ...l, sessions: [session, ...l.sessions.filter(s => s.id !== session.id)].slice(0, 30) })); write(['users', uid, 'flashcardSessions', session.id], session); });
    const saveResult = (session: Session, r: Review) => safe(() => {
        update(l => ({ ...l, reviews: { ...l.reviews, [session.deckId]: { ...l.reviews[session.deckId], [r.id]: r } }, sessions: [session, ...l.sessions.filter(s => s.id !== session.id)].slice(0, 30) }));
        write(['users', uid, 'decks', session.deckId, 'reviews', r.id], r);
        write(['users', uid, 'flashcardSessions', session.id], session);
        // Compatibility projection for existing Dashboard/server metrics. Reviews remain authoritative.
        write(['users', uid, 'decks', session.deckId, 'cards', r.id], { dueAt: r.dueAt, reviewCount: r.reviewCount, interval: r.interval, easeFactor: r.ease, repetition: r.repetitions, lapses: r.lapses });
    });
    const getReview = (c: Card) => { const r = normalizeReview(library.reviews[c.deckId]?.[c.id], c); return r.revision === c.revision ? r : normalizeReview({ revision: c.revision }, c); };
    const retrySync = async () => {
        try {
            const legacy = (item: {
                id: string;
                syncStatus?: unknown;
            }) => item.id.includes('-local-') || ['pending', 'failed'].includes(String(item.syncStatus || ''));
            if (!isReadOnlyAudit && !blocked) {
                for (const deck of current.current.decks) {
                    const path = ['users', uid, 'decks', deck.id];
                    if (legacy(deck) && !getQueuedOperation('set', path))
                        write(path, deck);
                    for (const c of current.current.cards[deck.id] || []) {
                        const path = ['users', uid, 'decks', deck.id, 'cards', c.id];
                        if (legacy(c) && cardValid(c) && !getQueuedOperation('set', path))
                            write(path, c);
                    }
                }
            }
            await flushOfflineSyncQueue(uid);
            setRetry(n => n + 1);
        }
        catch {
            setMessage('Sync failed. Device data has been preserved.');
        }
    };
    return { library, ready, blocked, message, setMessage, sync, saveDeck, saveCards, saveReview, saveSession, saveResult, getReview, retrySync };
}
