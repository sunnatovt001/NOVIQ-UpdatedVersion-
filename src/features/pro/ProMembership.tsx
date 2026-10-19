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
import './discovery.css';
import { membershipFailureMessage } from './membershipFailure';
export function MembershipBadge() {
 const {access,available}=useMembership(),c=useProCopy(),{locale}=useLocale();
 if(access.entitled)return <a className="ascend-membership-link" href="#/pricing"><Sparkles size={15}/>NOVIQ PRO<ArrowUpRight size={14}/></a>;
 const trial=available&&access.trialEligible&&config.features.trial;
 const caption=trial?(locale==='uz'?'7 kun bepul sinang':locale==='ru'?'7 дней бесплатно':'Try 7 days free'):'NOVIQ PRO';
 return <a className="ascend-membership-link noviq-pro-entry" href="#/pricing"><span className="noviq-pro-entry-icon"><Sparkles size={21}/></span><span className="noviq-pro-entry-copy"><strong>{c.preview}</strong><small>{caption}</small></span><ArrowUpRight className="noviq-pro-entry-arrow" size={18}/></a>;
}
export function TrialButton({label}:{label?:string}={}) { const [open, setOpen] = useState(false), c = useProCopy(), { access, available, busy } = useMembership(); return available && !access.entitled && access.trialEligible && config.features.trial ? <><button className="ascend-button ascend-primary" disabled={busy} onClick={() => setOpen(true)}>{label || c.trial}<ArrowUpRight size={17}/></button>{open && <TrialDialog close={() => setOpen(false)}/>}</> : null; }
function TrialDialog({ close }: {
    close: () => void;
}) {
    const theme = document.querySelector('.noviq-app')?.classList.contains('dark'); const c = useProCopy(), { start, busy, error } = useMembership(), [agree, setAgree] = useState(false), ref = React.useRef<HTMLDivElement>(null);
    useBodyScrollLock(true);
    useDialogFocus(true, ref, close);
    return createPortal(<div className="ascend-modal-backdrop" data-pro-portal="trial"><div className={`ascend-modal ascend discovery-trial-dialog ${theme ? 'dark' : ''}`} role="dialog" aria-modal="true" aria-label={c.trial} tabIndex={-1} ref={ref}><button className="ascend-icon" onClick={close} aria-label={c.close}><X size={20}/></button><Sparkles size={30}/><h2>{c.welcome}</h2><p>{c.trialHelp}</p><label className="ascend-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}/>{c.trialAgree}</label>{error && <p role="alert">{c.error}</p>}<button className="ascend-button ascend-primary" disabled={!agree || busy} onClick={async () => { try {
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
    const { access, busy, error, cancel, now, cinematic, setCinematic, available, refresh, failure } = useMembership(), { user } = useAuth(), { locale } = useLocale(), c = useProCopy();
    const [cycle, setCycle] = useState<BillingCycle>('monthly'), [provider, setProvider] = useState<PaymentProvider>('click'), [checkoutBusy, setCheckoutBusy] = useState(false), [message, setMessage] = useState(''), [cancelReview, setCancelReview] = useState(false);
    const labels = { FREE: c.free, PRO_TRIAL: c.trialState, PRO_ACTIVE: c.active, PRO_CANCEL_SCHEDULED: c.cancelState, PRO_EXPIRED: c.expired, PRO_PAST_DUE: c.pastDue };
    const end = available && access.trialEndsAt && access.state === 'PRO_TRIAL' ? access.trialEndsAt : available ? access.currentPeriodEnd : null;
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
  <section className="ascend-membership-hero"><div><span className="ascend-wordmark">NOVIQ PRO</span><h1>{locale === 'uz' ? 'O‘qishingizga mos rejani tanlang' : locale === 'ru' ? 'Выберите план для своего обучения' : 'Choose your next level of learning'}</h1><p>{locale === 'uz' ? 'Mavjud vositalar bilan boshlang yoki PRO imkoniyatlarini oching.' : locale === 'ru' ? 'Начните с доступных инструментов или откройте возможности PRO.' : 'Start with the tools you know, or unlock your complete PRO workspace.'}</p><div className="ascend-actions">{onPreview && <button className="ascend-button" onClick={onPreview}>{c.preview}</button>}</div></div><div className="ascend-orbit" aria-hidden="true"><i /><i /><i /><span>n</span></div></section>
  <section className="ascend-status" aria-live="polite"><div><strong>{labels[access.state as keyof typeof labels]}</strong>{end && <p>{c.expires}: <time dateTime={end}>{date(end)}</time>{access.state === 'PRO_TRIAL' && ` · ${c.remaining}: ${Math.floor(hours / 24)} ${c.days} ${hours % 24} ${c.hours}`}</p>}{!available && <p>{error ? membershipFailureMessage(failure, locale) : c.loading}</p>}</div><div className="ascend-actions"><button className="ascend-button" onClick={() => void refresh()}>{c.retry}</button></div></section>
  {error && available && <p className="ascend-notice" role="alert">{membershipFailureMessage(failure, locale)}</p>}
  {access.state === 'PRO_EXPIRED' && <section className="ascend-expired"><h2>{c.expired}</h2><p>{c.expiredHelp}</p><button className="ascend-button ascend-primary" onClick={() => document.getElementById('pro-prices')?.scrollIntoView({ block: 'start' })}>{c.upgrade}</button><a className="ascend-button" href="#/dashboard">{c.continueFree}</a></section>}
  <section id="pro-prices" className="pro-pricing-reference">
    <div className="pro-pricing-selector"><div className="ascend-segments" aria-label={c.membership}>{(['monthly', 'yearly'] as const).map(v => <button key={v} aria-pressed={cycle === v} onClick={() => setCycle(v)}>{v === 'monthly' ? c.monthly : c.yearly}</button>)}</div><p>{cycle === 'yearly' ? `${c.savings}: ${new Intl.NumberFormat(locale).format(config.prices.monthly * 12 - config.prices.yearly)} UZS (36%)` : c.monthly}</p></div>
    <div className="pro-plan-cards">
      <article className="pro-plan-card"><header><h2>{c.free}</h2><p>{c.continueFree}</p></header><div className="pro-plan-price"><strong>0</strong><span>UZS / {cycle === 'monthly' ? c.monthly : c.yearly}</span></div><dl>{[['plan','plannerFeature'],['cards','cardsFeature'],['tutor','tutorFeature'],['notes','notesFeature'],['focus','focusFeature'],['intelligence','analyticsFeature']].map(([id,feature])=><div key={id}><dt>{c[id as keyof typeof c]}</dt><dd>{c[feature as keyof typeof c]}</dd></div>)}</dl><a href="#/dashboard" className="ascend-button" aria-label={`${c.continueFree} · ${c.free}`}>{c.continueFree}<ArrowUpRight size={17}/></a></article>
      <article className="pro-plan-card pro-plan-featured"><header><span className="pro-plan-badge">NOVIQ PRO</span><h2>PRO</h2><p>{c.benefits}</p></header><div className="pro-plan-price"><strong>{new Intl.NumberFormat(locale).format(config.prices[cycle])}</strong><span>UZS / {cycle === 'monthly' ? c.monthly : c.yearly}</span></div><dl>{[['plan','proPlanner'],['cards','proCards'],['tutor','proTutor'],['notes','proNotes'],['focus','proFocus'],['intelligence','proAnalytics']].map(([id,feature])=><div key={id}><dt>{c[id as keyof typeof c]}</dt><dd><Check size={15}/>{c[feature as keyof typeof c]}</dd></div>)}</dl>
      <div className="pro-plan-actions"><TrialButton/><p>{c.paymentHelp}</p><label>{c.checkout}<select value={provider} onChange={e => setProvider(e.target.value as PaymentProvider)}><option value="click">Click</option><option value="payme">Payme</option><option value="card">Visa / Mastercard</option></select></label><button className="ascend-button ascend-primary" disabled={checkoutBusy || !access.billing?.providersConfigured} onClick={() => void checkout()}>{checkoutBusy ? c.working : c.checkout}</button>{!access.billing?.providersConfigured && <p>{c.paymentUnavailable}</p>}{message && <p role="status">{message}</p>}</div></article>
    </div><p className="pro-pricing-quota">{c.notUnlimited} · {c.quota}: {access.usage ? access.usage.total || 0 : '—'} / {access.quotas.total} · {c.intelligence}: {access.usage ? access.usage.counts?.intelligence || 0 : '—'} / {access.quotas.intelligence}</p>
  </section>
  <section className="ascend-faq"><h2>{c.benefits}</h2>{[[c.trial, c.trialHelp], [c.continueFree, c.lockedHelp], [c.cancelRenewal, c.cancelHelp]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
  {access.entitled && <section className="ascend-cancel"><h2>{c.cancelRenewal}</h2><p>{c.cancelHelp}</p>{cancelReview ? <div className="ascend-actions"><button className="ascend-button" disabled={busy} onClick={async () => { try {
        await cancel();
        setCancelReview(false);
    }
    catch { } }}>{busy ? c.working : c.cancelRenewal}</button><button className="ascend-button" onClick={() => setCancelReview(false)}>{c.close}</button></div> : <button className="ascend-button" onClick={() => setCancelReview(true)} disabled={access.state === 'PRO_CANCEL_SCHEDULED'}>{c.cancelRenewal}</button>}</section>}
 </div>;
}
