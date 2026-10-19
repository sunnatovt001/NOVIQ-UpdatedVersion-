import config from '../../../functions/pro-config.json';
import React, { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useMembership } from './MembershipContext';
import { useProCopy } from './proCopy';
import { writeDocWithQueue } from '@/src/lib/offlineSync';
function Reflection() { const { user } = useAuth(), { access } = useMembership(), c = useProCopy(), [text, setText] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false); if (!user || !access.entitled || !config.features.focusReflections)
    return null; return <section className="ascend ascend-reflection"><h2>{c.reflection}</h2><p>{c.reflectionHelp}</p><label>{c.reflection}<textarea value={text} onChange={e => setText(e.target.value)} maxLength={3000} rows={3}/></label><button className="ascend-button" disabled={!text.trim() || busy} onClick={async () => { setBusy(true); try {
    const result = await writeDocWithQueue({ userId: user.uid, path: ['users', user.uid, 'notebookNotes', crypto.randomUUID()], data: { tags: [], title: c.reflection, content: text.trim(), kind: 'focus-reflection', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), userId: user.uid }, merge: false });
    setText('');
    setMessage(result === 'synced' ? c.saved : c.deviceSaved);
}
catch {
    setMessage(c.error);
}
finally {
    setBusy(false);
} }}>{busy ? c.working : c.save}</button>{message && <p role="status">{message}</p>}</section>; }
export function FocusReflection() { const { user } = useAuth(); return user ? <Reflection key={user.uid}/> : null; }
