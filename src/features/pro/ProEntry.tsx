import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useMembership } from './MembershipContext';
import { useProCopy } from './proCopy';
export function ProEntry({ area }: {
    area: 'deck' | 'reports' | 'summary';
}) { const { user } = useAuth(), { access } = useMembership(), c = useProCopy(); return <a className="pro-entry" href={access.entitled ? '#/dashboard' : '#/pricing'} onClick={() => { if (user && access.entitled)
    try {
        sessionStorage.setItem(`noviq:${user.uid}:proDestination`, JSON.stringify({ tab: area === 'reports' ? 'reports' : 'studio', tool: area === 'deck' ? 'deck' : 'summary' }));
    }
    catch { } }}>{access.entitled ? area === 'deck' ? c.deck : area === 'reports' ? c.reports : c.summary : c.preview}<ArrowUpRight size={14}/></a>; }
