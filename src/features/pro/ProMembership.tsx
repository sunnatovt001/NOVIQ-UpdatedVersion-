import { navigateToPage } from '@/src/lib/navigation';
import { PromoInput } from './PromoInput';
import { promoCopy, promoError, type PromoQuote } from '@/src/lib/promo';
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, LockKeyhole, X, Sparkles, BookOpen, Crown, Folder, Tags, BarChart3 } from 'lucide-react';
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
import './glass-plans.css';
import { membershipFailureMessage } from './membershipFailure';
export function MembershipBadge() {
 const {access,available}=useMembership(),c=useProCopy(),{locale}=useLocale();
 if(access.entitled)return <a className="ascend-membership-link" href="/pricing"><Sparkles size={15}/>NOVIQ PRO<ArrowUpRight size={14}/></a>;
 const trial=available&&access.trialEligible&&config.features.trial;
 const caption=trial?(locale==='uz'?'7 kun bepul sinang':locale==='ru'?'7 дней бесплатно':'Try 7 days free'):'NOVIQ PRO';
 return <a className="ascend-membership-link noviq-pro-entry" href="/pricing"><span className="noviq-pro-entry-icon"><Sparkles size={21}/></span><span className="noviq-pro-entry-copy"><strong>{c.preview}</strong><small>{caption}</small></span><ArrowUpRight className="noviq-pro-entry-arrow" size={18}/></a>;
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
        navigateToPage('/dashboard');
    }
    catch { } }}>{busy ? c.working : c.confirmTrial}</button><button className="ascend-button" disabled={busy} onClick={close}>{c.cancel}</button></div></div>, document.body);
}
export function PremiumGate({ children, feature }: {
    children: React.ReactNode;
    feature?: keyof typeof config.features;
}) { const { access } = useMembership(), c = useProCopy(); if (feature && !config.features[feature])
    return <p role="status">{c.unavailable}</p>; return access.entitled ? <>{children}</> : <section className="ascend-lock"><LockKeyhole size={22}/><h2>{c.locked}</h2><p>{c.lockedHelp}</p><TrialButton /><a href="/pricing">{c.benefits}</a></section>; }
export function ProMembership({ onPreview }: {
    onPreview?: () => void;
}) {
    const { access, busy, error, cancel, now, cinematic, setCinematic, available, refresh, failure } = useMembership(), { user } = useAuth(), { locale } = useLocale(), c = useProCopy();
    const [cycle, setCycle] = useState<BillingCycle>('monthly'), [provider, setProvider] = useState<PaymentProvider>('click'), [checkoutBusy, setCheckoutBusy] = useState(false), [message, setMessage] = useState(''), [cancelReview, setCancelReview] = useState(false);
    const [promo,setPromo]=useState<PromoQuote|null>(null),[promoBusy,setPromoBusy]=useState(false);
    const promoSelection=useRef({cycle,uid:user?.uid});
    if(promoSelection.current.cycle!==cycle || promoSelection.current.uid!==user?.uid){promoSelection.current={cycle,uid:user?.uid};if(promo)setPromo(null);}
    const ui = locale==='uz'?{current:'Joriy rejangiz',manage:'Obunani boshqarish',confidence:'Ishonch bilan tanlang',clear:'Aniq narxlar',options:'Oylik va yillik variantlar',work:'Ishlaringiz siz bilan qoladi',saved:'Saqlangan o‘quv materiallaringizdan foydalaning',room:'O‘qish uchun ko‘proq imkoniyat',limits:'PRO’da kunlik AI limitlari yuqoriroq',faq:'Foydali savol-javoblar',subtitle:'O‘qish ritmingizga mos rejani toping.',freeHint:'Kundalik o‘qish odatingizni yarating',proHint:'Bir-biriga bog‘langan o‘qish maydoni'}:locale==='ru'?{current:'Ваш текущий план',manage:'Управлять подпиской',confidence:'Выбирайте уверенно',clear:'Понятные цены',options:'Месячный и годовой варианты',work:'Ваши материалы остаются с вами',saved:'Пользуйтесь сохранёнными учебными материалами',room:'Больше возможностей для учёбы',limits:'В PRO выше дневные лимиты ИИ',faq:'Полезные ответы',subtitle:'Найдите план под свой учебный ритм.',freeHint:'Создайте привычку учиться каждый день',proHint:'Единое пространство для обучения'}:{current:'Your current plan',manage:'Manage membership',confidence:'Choose with confidence',clear:'Clear pricing',options:'Monthly and annual options',work:'Your work stays with you',saved:'Keep using your saved study materials',room:'More room to learn',limits:'PRO includes higher daily AI limits',faq:'A few useful answers',subtitle:'Find the plan that fits your study rhythm.',freeHint:'Build your daily study habit',proHint:'A more connected learning workspace'};
    const labels = { FREE: c.free, PRO_TRIAL: c.trialState, PRO_ACTIVE: c.active, PRO_CANCEL_SCHEDULED: c.cancelState, PRO_EXPIRED: c.expired, PRO_PAST_DUE: c.pastDue };
    const end = available && access.trialEndsAt && access.state === 'PRO_TRIAL' ? access.trialEndsAt : available ? access.currentPeriodEnd : null;
    const hours = end ? Math.max(0, Math.ceil((Date.parse(end) - now) / 3600000)) : 0;
    const date = (v: string) => new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
    const checkoutLock=useRef(false);
    const checkout = async () => { if (!user || checkoutLock.current || promoBusy)
        return; checkoutLock.current=true;setCheckoutBusy(true); setMessage(''); try {
        const response = await recordCheckout({ userId: user.uid, billingCycle: cycle, provider, amount: config.prices[cycle], promoCode:promo?.code });
        if (owner.current !== user.uid)
            return;
        if(response.activated){setPromo(null);setMessage(promoCopy(locale).activated);await refresh();}
        else if(response.checkoutUrl) location.assign(response.checkoutUrl);
    }
    catch (error) {
        setMessage((error as {details?:unknown})?.details ? promoError(error,locale) : c.paymentUnavailable);
    }
    finally {
        checkoutLock.current=false;setCheckoutBusy(false);
    } };
    const owner = useRef(user?.uid);
    owner.current = user?.uid;
    return <div data-entitled={access.entitled} className="ascend ascend-membership plans-glass">
  <section className="ascend-membership-hero"><div><span className="ascend-wordmark">NOVIQ PRO</span><h1>{locale === 'uz' ? 'O‘qishingizga mos rejani tanlang' : locale === 'ru' ? 'Выберите план для своего обучения' : 'Choose your next level of learning'}</h1><p>{ui.subtitle}</p><div className="ascend-actions">{onPreview && <button className="ascend-button" onClick={onPreview}>{c.preview}</button>}</div></div><div className="ascend-orbit" aria-hidden="true"><i /><i /><i /><span>n</span></div></section>
  <section className="ascend-status" aria-live="polite"><div><strong>{labels[access.state as keyof typeof labels]}</strong>{end && <p>{c.expires}: <time dateTime={end}>{date(end)}</time>{access.state === 'PRO_TRIAL' && ` · ${c.remaining}: ${Math.floor(hours / 24)} ${c.days} ${hours % 24} ${c.hours}`}</p>}{!available && <p>{error ? membershipFailureMessage(failure, locale) : c.loading}</p>}</div><div className="ascend-actions"><button className="ascend-button" onClick={() => void refresh()}>{c.retry}</button></div></section>
  {error && available && <p className="ascend-notice" role="alert">{membershipFailureMessage(failure, locale)}</p>}
  {access.state === 'PRO_EXPIRED' && <section className="ascend-expired"><h2>{c.expired}</h2><p>{c.expiredHelp}</p><button className="ascend-button ascend-primary" onClick={() => document.getElementById('pro-prices')?.scrollIntoView({ block: 'start' })}>{c.upgrade}</button><a className="ascend-button" href="/dashboard">{c.continueFree}</a></section>}
  <section id="pro-prices" className="pro-pricing-reference">
    <div className="pro-pricing-selector"><div className="ascend-segments" aria-label={c.membership}>{(['monthly', 'yearly'] as const).map(v => <button key={v} aria-pressed={cycle === v} disabled={checkoutBusy} onClick={() => setCycle(v)}>{v === 'monthly' ? c.monthly : c.yearly}</button>)}</div><p>{cycle === 'yearly' ? `${c.savings}: ${new Intl.NumberFormat(locale).format(config.prices.monthly * 12 - config.prices.yearly)} UZS (36%)` : c.monthly}</p></div>
    <div className="pro-plan-cards">
      <article className="pro-plan-card"><header><span className="pl-plan-icon"><BookOpen size={30}/></span><h2>{c.free}</h2><p>{ui.freeHint}</p></header><div className="pro-plan-price"><strong>0</strong><span>UZS / {cycle === 'monthly' ? c.monthly : c.yearly}</span></div><dl>{[['plan','plannerFeature'],['cards','cardsFeature'],['tutor','tutorFeature'],['notes','notesFeature'],['focus','focusFeature'],['intelligence','analyticsFeature']].map(([id,feature])=><div key={id}><dt>{c[id as keyof typeof c]}</dt><dd>{c[feature as keyof typeof c]}</dd></div>)}</dl><a href="/dashboard" className="ascend-button" aria-label={`${c.continueFree} · ${c.free}`}>{c.continueFree}<ArrowUpRight size={17}/></a></article>
      <article className="pro-plan-card pro-plan-featured"><header><span className="pl-plan-icon"><Crown size={30}/></span>{access.entitled && <span className="pro-plan-badge">{ui.current}</span>}<h2>NOVIQ PRO</h2><p>{ui.proHint}</p></header><div className="pro-plan-price"><strong>{new Intl.NumberFormat(locale).format(config.prices[cycle])}</strong><span>UZS / {cycle === 'monthly' ? c.monthly : c.yearly}</span></div><dl>{[['plan','proPlanner'],['cards','proCards'],['tutor','proTutor'],['notes','proNotes'],['focus','proFocus'],['intelligence','proAnalytics']].map(([id,feature])=><div key={id}><dt>{c[id as keyof typeof c]}</dt><dd><Check size={15}/>{c[feature as keyof typeof c]}</dd></div>)}</dl>
      <PromoInput key={user?.uid} cycle={cycle} locale={locale} userId={user?.uid} locked={checkoutBusy} onChange={(value,loading)=>{setPromo(value);setPromoBusy(loading);}}/><div className="pro-plan-actions">{access.entitled ? <button type="button" className="ascend-button ascend-primary" onClick={()=>{const target=document.getElementById("plans-manage");target?.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});target?.focus({preventScroll:true});}}>{ui.manage}<ArrowUpRight size={17}/></button> : <TrialButton/>}<details className="pl-checkout"><summary>{c.checkout}</summary><p>{c.paymentHelp}</p><label>{c.checkout}<select value={provider} onChange={e => setProvider(e.target.value as PaymentProvider)}><option value="click">Click</option><option value="payme">Payme</option><option value="card">Visa / Mastercard</option></select></label><button className="ascend-button ascend-primary" disabled={checkoutBusy || promoBusy || (!access.billing?.providersConfigured && promo?.amount!==0)} onClick={() => void checkout()}>{checkoutBusy ? c.working : promo?.amount===0 ? promoCopy(locale).free : c.checkout}</button>{!access.billing?.providersConfigured && promo?.amount!==0 && <p>{c.paymentUnavailable}</p>}{message && <p role="status">{message}</p>}</details></div></article>
    </div><p className="pro-pricing-quota">{c.notUnlimited} · {c.quota}: {access.usage ? access.usage.total || 0 : '—'} / {access.quotas.total} · {c.intelligence}: {access.usage ? access.usage.counts?.intelligence || 0 : '—'} / {access.quotas.intelligence}</p>
  </section>
  <section className="pl-confidence"><h2>{ui.confidence}</h2><div>{[[Tags,ui.clear,ui.options],[Folder,ui.work,ui.saved],[BarChart3,ui.room,ui.limits]].map(([Icon,title,detail],index)=>{const Mark=Icon as typeof Tags;return <article key={index}><span><Mark size={23}/></span><div><h3>{String(title)}</h3><p>{String(detail)}</p></div></article>;})}</div></section><section className="ascend-faq"><h2>{ui.faq}</h2>{[[c.trial, c.trialHelp], [c.continueFree, c.lockedHelp], [c.cancelRenewal, c.cancelHelp]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
  {access.entitled && <section id="plans-manage" tabIndex={-1} className="ascend-cancel"><h2>{c.cancelRenewal}</h2><p>{c.cancelHelp}</p>{cancelReview ? <div className="ascend-actions"><button className="ascend-button" disabled={busy} onClick={async () => { try {
        await cancel();
        setCancelReview(false);
    }
    catch { } }}>{busy ? c.working : c.cancelRenewal}</button><button className="ascend-button" onClick={() => setCancelReview(false)}>{c.close}</button></div> : <button className="ascend-button" onClick={() => setCancelReview(true)} disabled={access.state === 'PRO_CANCEL_SCHEDULED'}>{c.cancelRenewal}</button>}</section>}
 </div>;
}
