import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, LockKeyhole, X, Sparkles } from 'lucide-react';
import { useMembership } from './MembershipContext';
import { useProCopy } from './proCopy';
import { useLocale } from '@/src/contexts/LocaleContext';
import { useDialogFocus } from '@/src/lib/useDialogFocus';
import { useBodyScrollLock } from '@/src/lib/useBodyScrollLock';
import config from '../../../functions/pro-config.json';
import { recordCheckout } from '@/src/lib/subscription';
import { useAuth } from '@/src/contexts/AuthContext';
import { trackUserEvent } from '@/src/lib/analytics';
import type { BillingCycle, PaymentProvider } from '@/src/types';
import './pro.css';
export function MembershipBadge() { const { access } = useMembership(), c = useProCopy(); return <a className="ascend-membership-link" href="#/pricing"><Sparkles size={15}/>{access.entitled ? 'NOVIQ PRO' : c.preview}<ArrowUpRight size={14}/></a>; }
export function TrialButton() { const [open, setOpen] = useState(false), c = useProCopy(), { access } = useMembership(); return access.trialEligible && config.features.trial ? <><button className="ascend-button ascend-primary" onClick={() => setOpen(true)}>{c.trial}<ArrowUpRight size={17}/></button>{open && <TrialDialog close={() => setOpen(false)}/>}</> : null; }
function TrialDialog({ close }: {
    close: () => void;
}) {
    const c = useProCopy(), { start, busy, error } = useMembership(), [agree, setAgree] = useState(false), ref = React.useRef<HTMLDivElement>(null);
    useBodyScrollLock(true);
    useDialogFocus(true, ref, close);
    return createPortal(<div className="ascend-modal-backdrop"><div className="ascend-modal ascend" role="dialog" aria-modal="true" aria-label={c.trial} tabIndex={-1} ref={ref}><button className="ascend-icon" onClick={close} aria-label={c.close}><X size={20}/></button><Sparkles size={30}/><h2>{c.welcome}</h2><p>{c.trialHelp}</p><label className="ascend-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}/>{c.trialAgree}</label>{error && <p role="alert">{c.error}</p>}<button className="ascend-button ascend-primary" disabled={!agree || busy} onClick={async () => { try {
        await start();
        close();
        location.hash = '/dashboard';
    }
    catch { } }}>{busy ? c.working : c.confirmTrial}</button><button className="ascend-button" disabled={busy} onClick={close}>{c.cancel}</button></div></div>, document.body);
}
export function PremiumGate({ children, feature }: {
    children: React.ReactNode;
    feature?: keyof typeof config.features;
}) { const { access } = useMembership(), c = useProCopy(); if (feature && !config.features[feature])
    return <p role="status">{c.unavailable}</p>; return access.entitled ? <>{children}</> : <section className="ascend-lock"><LockKeyhole size={22}/><h2>{c.locked}</h2><p>{c.lockedHelp}</p><TrialButton /><a href="#/pricing">{c.benefits}</a></section>; }
export function ProMembership({ onPreview }: {
    onPreview?: () => void;
}) {
    const { access, busy, error, cancel, now, cinematic, setCinematic, available, refresh } = useMembership(), { user } = useAuth(), { locale } = useLocale(), c = useProCopy();
    const [cycle, setCycle] = useState<BillingCycle>('monthly'), [provider, setProvider] = useState<PaymentProvider>('click'), [checkoutBusy, setCheckoutBusy] = useState(false), [message, setMessage] = useState(''), [cancelReview, setCancelReview] = useState(false);
    const labels = { FREE: c.free, PRO_TRIAL: c.trialState, PRO_ACTIVE: c.active, PRO_CANCEL_SCHEDULED: c.cancelState, PRO_EXPIRED: c.expired, PRO_PAST_DUE: c.pastDue };
    const end = access.trialEndsAt && access.state === 'PRO_TRIAL' ? access.trialEndsAt : access.currentPeriodEnd;
    const hours = end ? Math.max(0, Math.ceil((Date.parse(end) - now) / 3600000)) : 0;
    const date = (v: string) => new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
    const checkout = async () => { if (!user || checkoutBusy)
        return; setCheckoutBusy(true); setMessage(''); try {
        const response = await recordCheckout({ userId: user.uid, billingCycle: cycle, provider, amount: config.prices[cycle] });
        if (owner.current !== user.uid)
            return;
        location.assign(response.checkoutUrl);
    }
    catch {
        setMessage(c.paymentUnavailable);
    }
    finally {
        setCheckoutBusy(false);
    } };
    const owner = useRef(user?.uid);
    owner.current = user?.uid;
    return <div className="ascend ascend-membership">
  <section className="ascend-membership-hero"><div><span className="ascend-wordmark">NOVIQ PRO</span><h1>{c.tagline}</h1><p>{c.trialHelp}</p><div className="ascend-actions"><TrialButton />{onPreview && <button className="ascend-button" onClick={onPreview}>{c.preview}</button>}</div></div><div className="ascend-orbit" aria-hidden="true"><i /><i /><i /><span>n</span></div></section>
  <section className="ascend-status" aria-live="polite"><div><strong>{labels[access.state as keyof typeof labels]}</strong>{end && <p>{c.expires}: <time dateTime={end}>{date(end)}</time>{access.state === 'PRO_TRIAL' && ` · ${c.remaining}: ${Math.floor(hours / 24)} ${c.days} ${hours % 24} ${c.hours}`}</p>}{!available && <p>{error ? c.error : c.loading}</p>}</div><div className="ascend-actions">{access.entitled && <button className="ascend-button" onClick={() => setCinematic(!cinematic)}>{cinematic ? c.standard : c.cinematic}</button>}<button className="ascend-button" onClick={() => void refresh()}>{c.retry}</button></div></section>
  {error && <p className="ascend-notice" role="alert">{c.error}</p>}
  {access.state === 'PRO_EXPIRED' && <section className="ascend-expired"><h2>{c.expired}</h2><p>{c.expiredHelp}</p><button className="ascend-button ascend-primary" onClick={() => document.getElementById('pro-prices')?.scrollIntoView({ block: 'start' })}>{c.upgrade}</button><a className="ascend-button" href="#/dashboard">{c.continueFree}</a></section>}
  <section id="pro-prices" className="ascend-price-layout"><div><h2>{c.benefits}</h2><p>{c.notUnlimited}</p><div className="ascend-segments" aria-label={c.membership}>{(['monthly', 'yearly'] as const).map(v => <button key={v} aria-pressed={cycle === v} onClick={() => setCycle(v)}>{v === 'monthly' ? c.monthly : c.yearly}</button>)}</div><div className="ascend-price"><strong>{new Intl.NumberFormat(locale).format(config.prices[cycle])}</strong><span>UZS / {cycle === 'monthly' ? c.monthly : c.yearly}</span></div>{cycle === 'yearly' && <p>{c.savings}: {new Intl.NumberFormat(locale).format(config.prices.monthly * 12 - config.prices.yearly)} UZS ({Math.round((1 - config.prices.yearly / (config.prices.monthly * 12)) * 100)}%)</p>}<p>{c.paymentHelp}</p><label>{c.checkout}<select value={provider} onChange={e => setProvider(e.target.value as PaymentProvider)}><option value="click">Click</option><option value="payme">Payme</option><option value="card">Visa / Mastercard</option></select></label><button className="ascend-button ascend-primary" disabled={checkoutBusy || !access.billing?.providersConfigured} onClick={() => void checkout()}>{checkoutBusy ? c.working : c.checkout}</button>{!access.billing?.providersConfigured && <p>{c.paymentUnavailable}</p>}{message && <p role="status">{message}</p>}<p>{c.quota}: {access.usage ? access.usage.total || 0 : '—'} / {access.quotas.total} · {c.intelligence}: {access.usage ? access.usage.counts?.intelligence || 0 : '—'} / {access.quotas.intelligence}</p></div>
  <div className="ascend-matrix" role="table" aria-label={c.benefits}><div role="row"><strong role="columnheader">NOVIQ</strong><strong role="columnheader">{c.free}</strong><strong role="columnheader">PRO</strong></div>{[['plan', 'plannerFeature', 'proPlanner'], ['cards', 'cardsFeature', 'proCards'], ['tutor', 'tutorFeature', 'proTutor'], ['notes', 'notesFeature', 'proNotes'], ['focus', 'focusFeature', 'proFocus'], ['intelligence', 'analyticsFeature', 'proAnalytics']].map(([id, free, pro]) => <div role="row" key={id}><strong role="rowheader">{c[id as keyof typeof c]}</strong><span role="cell">{c[free as keyof typeof c]}</span><span role="cell"><Check size={14}/>{c[pro as keyof typeof c]}</span></div>)}</div></section>
  <section className="ascend-faq"><h2>{c.benefits}</h2>{[[c.trial, c.trialHelp], [c.continueFree, c.lockedHelp], [c.cancelRenewal, c.cancelHelp]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
  {access.entitled && <section className="ascend-cancel"><h2>{c.cancelRenewal}</h2><p>{c.cancelHelp}</p>{cancelReview ? <div className="ascend-actions"><button className="ascend-button" disabled={busy} onClick={async () => { try {
        await cancel();
        setCancelReview(false);
    }
    catch { } }}>{busy ? c.working : c.cancelRenewal}</button><button className="ascend-button" onClick={() => setCancelReview(false)}>{c.close}</button></div> : <button className="ascend-button" onClick={() => setCancelReview(true)} disabled={access.state === 'PRO_CANCEL_SCHEDULED'}>{c.cancelRenewal}</button>}</section>}
 </div>;
}
