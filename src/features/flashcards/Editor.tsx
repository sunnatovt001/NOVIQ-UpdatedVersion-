import React, { useEffect, useRef, useState } from 'react';
import { Plus, Copy, Trash2, ArrowUp, ArrowDown, Sparkles, ImagePlus } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from '@/src/lib/storageStore';
import { storage } from '@/src/lib/firebase';
import { loadLocalDataStrict, saveLocalData } from '@/src/lib/localStore';
import { generateDefinitionSuggestions } from '@/src/lib/gemini';
import { isReadOnlyAudit } from '@/src/lib/auditMode';
import { cardValid, emptyCard, normalizeCard, normalizeAnswer, parseImport, parseSuggestions, type Card, type Deck } from './model';
type Props = {
    importInitiallyOpen?: boolean;
    uid: string;
    deck: Deck;
    cards: Card[];
    uz: boolean;
    save: (cards: Card[]) => void;
    close: () => void;
};
export function Editor({ uid, deck, cards, uz, save, close, importInitiallyOpen = false }: Props) {
    const t = (en: string, u: string) => uz ? u : en, key = `noviq:${uid}:flashcardDraft:${deck.id}`;
    const [initial] = useState(() => { try {
        const value = loadLocalDataStrict<unknown>(key, null);
        if (value === null)
            return { rows: cards.length ? [...cards].sort((a, b) => a.order - b.order) : [emptyCard(deck.id)], blocked: false };
        if (!Array.isArray(value) || value.some(c => !c || typeof c.id !== 'string'))
            throw new Error();
        return { rows: value.map(c => normalizeCard(c, c.id, deck.id)), blocked: false };
    }
    catch {
        return { rows: cards.length ? [...cards].sort((a, b) => a.order - b.order) : [emptyCard(deck.id)], blocked: true };
    } });
    const [rows, setRows] = useState<Card[]>(initial.rows);
    const [status, setStatus] = useState(''), [advanced, setAdvanced] = useState(''), [removed, setRemoved] = useState<Card | null>(null), [importText, setImportText] = useState(''), [page, setPage] = useState(0), [auto, setAuto] = useState(false);
    const [suggestions, setSuggestions] = useState<{
        id: string;
        term: string;
        items: ReturnType<typeof parseSuggestions>;
    } | null>(null), [aiBusy, setAiBusy] = useState(false), [target, setTarget] = useState('uz'), [source, setSource] = useState('en');
    const [uploading, setUploading] = useState(''), [draftBlocked, setDraftBlocked] = useState(initial.blocked);
    const rowsRef = useRef(rows), request = useRef(0), cache = useRef(new Map<string, ReturnType<typeof parseSuggestions>>()), mounted = useRef(true);
    rowsRef.current = rows;
    useEffect(() => { request.current++; setSuggestions(null); }, [source, target, deck.subject]);
    useEffect(() => { mounted.current = true; if (initial.blocked)
        setStatus(t('Draft could not be read. Export a backup before editing.', 'Qoralamani o‘qib bo‘lmadi. Avval zaxira nusxa oling.')); return () => { mounted.current = false; request.current++; }; }, []);
    useEffect(() => { if (draftBlocked)
        return; try {
        saveLocalData(key, rows);
        setStatus(t('Draft saved on this device', 'Qoralama shu qurilmada saqlandi'));
    }
    catch {
        setDraftBlocked(true);
        setStatus(t('Draft could not be saved. Keep this page open and export a backup.', 'Qoralama saqlanmadi. Sahifani ochiq qoldirib, zaxira nusxa oling.'));
    } }, [rows, draftBlocked]);
    const patch = (id: string, values: Partial<Card>) => { request.current++; setSuggestions(null); setRows(r => r.map(c => c.id === id ? { ...c, ...values } : c)); };
    const add = () => { setRows(r => [...r, emptyCard(deck.id, r.length)]); setPage(Math.floor(rows.length / 30)); };
    const suggest = async (id: string, regenerate = false) => {
        const card = rowsRef.current.find(c => c.id === id);
        if (!card?.front.trim())
            return;
        const token = ++request.current, term = card.front, k = [term, deck.subject, source, target].join('|');
        setAiBusy(true);
        setStatus('');
        try {
            const items = !regenerate && cache.current.has(k) ? cache.current.get(k)! : parseSuggestions(await generateDefinitionSuggestions(term, deck.subject, source, target));
            if (items.some(item => normalizeAnswer(item.front) !== normalizeAnswer(term)))
                throw new Error('AI returned a different term. Please regenerate.');
            if (!mounted.current || token !== request.current || rowsRef.current.find(c => c.id === id)?.front !== term)
                return;
            cache.current.set(k, items);
            setSuggestions({ id, term, items });
        }
        catch (e) {
            if (mounted.current && token === request.current)
                setStatus(t('AI suggestion unavailable. Manual editing remains available.', 'AI taklifi mavjud emas. Qo‘lda yozish mumkin.') + ' ' + (e instanceof Error ? e.message : ''));
        }
        finally {
            if (mounted.current)
                setAiBusy(false);
        }
    };
    const focused = useRef('');
    useEffect(() => { if (!auto || !focused.current)
        return; const c = rows.find(c => c.id === focused.current); if (!c?.front.trim() || c.back.trim())
        return; const timer = setTimeout(() => void suggest(c.id), 900); return () => clearTimeout(timer); }, [rows, auto, source, target]);
    const accept = (item: ReturnType<typeof parseSuggestions>[number]) => {
        if (!suggestions)
            return;
        const c = rowsRef.current.find(c => c.id === suggestions.id);
        if (!c || c.front !== suggestions.term)
            return;
        // Fill empty fields only. The student keeps every manually entered value.
        patch(c.id, { back: c.back || item.back, translation: c.translation || item.translation, example: c.example || item.example, pronunciation: c.pronunciation || item.pronunciation, partOfSpeech: c.partOfSpeech || item.partOfSpeech, hint: c.hint || item.hint });
    };
    const upload = async (id: string, file?: File) => {
        if (isReadOnlyAudit) {
            setStatus(t('Uploads are disabled in read-only audit mode.', 'Faqat o‘qish rejimida rasm yuklab bo‘lmaydi.'));
            return;
        }
        if (!file)
            return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
            setStatus(t('Choose JPEG, PNG or WebP under 5 MB.', '5 MB dan kichik JPEG, PNG yoki WebP tanlang.'));
            return;
        }
        setUploading(id);
        try {
            const image = await createImageBitmap(file);
            if (image.width > 6000 || image.height > 6000) {
                image.close();
                throw new Error('Maximum image dimensions: 6000 × 6000');
            }
            image.close();
            const imageRef = ref(storage, `users/${uid}/flashcards/${deck.id}/${crypto.randomUUID()}`);
            await new Promise<void>((resolve, reject) => { uploadBytesResumable(imageRef, file, { contentType: file.type }).on('state_changed', s => { if (mounted.current)
                setStatus(`${t('Uploading', 'Yuklanmoqda')} ${Math.round(s.bytesTransferred / s.totalBytes * 100)}%`); }, reject, resolve); });
            const url = await getDownloadURL(imageRef);
            if (mounted.current)
                patch(id, { imageUrl: url });
        }
        catch {
            if (mounted.current)
                setStatus(t('Image upload failed. Text is still saved in your draft.', 'Rasm yuklanmadi. Matn qoralamada saqlangan.'));
        }
        finally {
            if (mounted.current)
                setUploading('');
        }
    };
    const commit = () => {
        try {
            const active = rows.filter(c => !c.deleted);
            if (active.some(c => !cardValid(c)))
                throw new Error(t('Every card needs a front and back.', 'Har bir kartochkaga savol va javob kerak.'));
            const changed = rows.map((c, i) => { const old = cards.find(x => x.id === c.id); const semantic = !!old && (old.front.normalize('NFC').trim() !== c.front.normalize('NFC').trim() || old.back.normalize('NFC').trim() !== c.back.normalize('NFC').trim()); return { ...c, order: i, revision: semantic ? old.revision + 1 : c.revision, language: source }; }).filter(c => { const old = cards.find(o => o.id === c.id); return !old || JSON.stringify(c) !== JSON.stringify(old); });
            save(changed);
            localStorage.removeItem(key);
            close();
        }
        catch (e) {
            setStatus(e instanceof Error ? e.message : 'Save failed');
        }
    };
    const importRows = () => { try {
        const parsed = parseImport(importText);
        if (parsed.errors.length)
            throw new Error(parsed.errors.join('\n'));
        const seen = new Set(rows.map(c => normalizeAnswer(c.front) + '|' + normalizeAnswer(c.back)));
        const batch = parsed.rows.filter(c => { const k = normalizeAnswer(c.front) + '|' + normalizeAnswer(c.back); if (seen.has(k))
            return false; seen.add(k); return true; });
        setRows(r => [...r, ...batch.map((c, i) => ({ ...emptyCard(deck.id, r.length + i), ...c }))]);
        setImportText('');
        setStatus(`${batch.length} ${t('cards imported into draft', 'kartochka qoralamaga qo‘shildi')}`);
    }
    catch (e) {
        setStatus(String(e));
    } };
    const exportDraft = () => { const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'noviq-card-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    return <section className="fc-editor" aria-label={t('Card editor', 'Kartochka tahrirlash')}><div className="fc-section-heading"><div><span className="fc-eyebrow">{t('CREATE EFFORTLESSLY', 'OSON YARATING')}</span><h3>{t('Make it memorable.', 'Esda qolarli qiling.')}</h3></div><button className="fc-button" onClick={close}>{t('Close editor', 'Tahrirni yopish')}</button></div>
    <p role="status" className="fc-muted">{status}</p><div className="fc-editor-tools"><label>{t('Source language', 'Asl til')}<select value={source} onChange={e => setSource(e.target.value)}><option value="en">English</option><option value="uz">O‘zbekcha</option><option value="zh">中文</option><option value="ru">Русский</option></select></label><label>{t('Translation language', 'Tarjima tili')}<select value={target} onChange={e => setTarget(e.target.value)}><option value="uz">O‘zbekcha</option><option value="en">English</option><option value="ru">Русский</option></select></label><label><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/>{t('Suggest after typing (uses AI allowance)', 'Yozgandan keyin AI taklifi (limit ishlatiladi)')}</label><button className="fc-button" onClick={exportDraft}>{t('Export draft', 'Qoralamani yuklash')}</button></div>
    <fieldset disabled={draftBlocked} className="fc-editor-rows">{rows.slice(page * 30, (page + 1) * 30).map((c, offset) => {
            const i = page * 30 + offset, duplicate = rows.some(other => other.id !== c.id && !other.deleted && normalizeAnswer(other.front) === normalizeAnswer(c.front) && c.front.trim());
            return <article className={`fc-editor-row ${c.deleted ? 'fc-deleted' : ''}`} key={c.id}><div className="fc-row-top"><strong>{i + 1}</strong><div><button className="fc-icon" aria-label={t('Move up', 'Yuqoriga')} disabled={i === 0} onClick={() => setRows(r => { const a = [...r]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}><ArrowUp size={16}/></button><button className="fc-icon" aria-label={t('Move down', 'Pastga')} disabled={i === rows.length - 1} onClick={() => setRows(r => { const a = [...r]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; })}><ArrowDown size={16}/></button><button className="fc-icon" aria-label={t('Duplicate card', 'Nusxalash')} onClick={() => setRows(r => [...r, { ...c, id: crypto.randomUUID(), revision: 1, deleted: false }])}><Copy size={16}/></button><button className="fc-icon" aria-label={c.deleted ? t('Restore card', 'Tiklash') : t('Delete card', 'O‘chirish')} onClick={() => { setRemoved(c); patch(c.id, { deleted: !c.deleted }); }}><Trash2 size={16}/></button></div></div>
      {!c.deleted && <><div className="fc-editor-pair"><label>{t('Term or question', 'Atama yoki savol')}<textarea aria-label={t("Term or question", "Atama yoki savol")} value={c.front} maxLength={10000} onFocus={() => { focused.current = c.id; }} onChange={e => patch(c.id, { front: e.target.value })} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    add();
                } }}/></label><label>{t('Answer or definition', 'Javob yoki izoh')}<textarea aria-label={t("Answer or definition", "Javob yoki izoh")} value={c.back} maxLength={20000} onChange={e => patch(c.id, { back: e.target.value })}/></label></div>
      {duplicate && <p className="fc-muted">{t('This term already appears. Check whether it is a different meaning.', 'Bu atama bor. Boshqa ma’no ekanini tekshiring.')}</p>}
      <div className="fc-row-actions"><button className="fc-button" disabled={aiBusy || !c.front.trim()} onClick={() => void suggest(c.id)}><Sparkles size={16}/>{aiBusy ? t('Thinking…', 'O‘ylanmoqda…') : t('Suggest with AI', 'AI taklifi')}</button><button className="fc-button" onClick={() => setAdvanced(a => a === c.id ? '' : c.id)}>{t('Details & media', 'Tafsilot va rasm')}</button></div>
      {advanced === c.id && <div className="fc-advanced">{(['translation', 'example', 'pronunciation', 'partOfSpeech', 'hint', 'source'] as const).map((field, j) => <label key={field}>{[t('Translation', 'Tarjima'), t('Example', 'Misol'), t('Pronunciation / pinyin', 'Talaffuz / pinyin'), t('Part of speech', 'So‘z turkumi'), t('Hint', 'Yordam'), t('Source / reference', 'Manba')][j]}<input value={c[field]} onChange={e => patch(c.id, { [field]: e.target.value })}/></label>)}<label>{t('Alternate answers (one per line)', 'Muqobil javoblar (har qatorga bittadan)')}<textarea value={c.alternateAnswers.join('\n')} onChange={e => patch(c.id, { alternateAnswers: e.target.value.split('\n') })}/></label><label className="fc-button"><ImagePlus size={18}/>{t('Upload image', 'Rasm yuklash')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading} onChange={e => void upload(c.id, e.target.files?.[0])}/></label>{c.imageUrl && <><img className="fc-editor-image" src={c.imageUrl} alt={t('Card image preview', 'Rasm ko‘rinishi')}/><button className="fc-button" onClick={() => patch(c.id, { imageUrl: '' })}>{t('Remove image', 'Rasmni olib tashlash')}</button></>}</div>}
      {suggestions?.id === c.id && <aside className="fc-ai-suggestions"><strong>{t('AI suggestions — review for accuracy', 'AI takliflari — to‘g‘riligini tekshiring')}</strong>{suggestions.items.map((item, index) => <div key={index}><p>{item.back}</p>{item.translation && <p>{item.translation}</p>}{item.example && <p>{item.example}</p>}<button className="fc-button" onClick={() => accept(item)}>{t('Fill empty fields with this meaning', 'Bo‘sh maydonlarni shu ma’no bilan to‘ldirish')}</button></div>)}<button className="fc-button" onClick={() => void suggest(c.id, true)}>{t('Regenerate', 'Qayta yaratish')}</button><button className="fc-button" onClick={() => { request.current++; setSuggestions(null); }}>{t('Reject', 'Rad etish')}</button></aside>}</>}
    </article>;
        })}</fieldset>
    {removed && <button className="fc-button" onClick={() => { patch(removed.id, { deleted: removed.deleted }); setRemoved(null); }}>{t('Undo deletion', 'O‘chirishni bekor qilish')}</button>}
    <div className="fc-pagination"><button className="fc-button" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('Previous', 'Oldingi')}</button><span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 30))}</span><button className="fc-button" disabled={(page + 1) * 30 >= rows.length} onClick={() => setPage(p => p + 1)}>{t('Next', 'Keyingi')}</button></div>
    <details className="fc-import" open={importInitiallyOpen || undefined}><summary>{t('Import cards · CSV, TSV, JSON or term — definition', 'Import · CSV, TSV, JSON yoki atama — izoh')}</summary><label>{t('Paste cards for preview', 'Ko‘rish uchun kartochkalarni joylang')}<textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder={'front\tback\ntenacious\tVery determined'}/></label><input aria-label={t('Import file', 'Fayl import qilish')} type="file" accept=".csv,.tsv,.json,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f && f.size <= 1000000)
        setImportText(await f.text());
    else
        setStatus(t('Maximum 1 MB', 'Maksimum 1 MB')); }}/><button className="fc-button" onClick={importRows} disabled={!importText.trim()}>{t('Preview in editor', 'Tahrirlashda ko‘rish')}</button></details>
    <div className="fc-editor-footer"><button className="fc-button" onClick={add} disabled={draftBlocked}><Plus size={18}/>{t('Add card', 'Kartochka qo‘shish')}</button><span className="fc-muted">Ctrl / ⌘ + Enter · {t('add next card', 'keyingi kartochka')}</span><button className="fc-primary" onClick={commit} disabled={draftBlocked || !!uploading}>{t('Save cards', 'Kartochkalarni saqlash')}</button></div>
  </section>;
}
