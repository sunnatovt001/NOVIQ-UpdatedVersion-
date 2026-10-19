import React,{useRef,useState} from 'react';
import {ArrowUpRight,ArrowRight,Check,CalendarDays,BookOpen,MessageCircle,ChartNoAxesCombined,ShieldCheck,Layers,Clock3} from 'lucide-react';
import {useMembership} from './MembershipContext';
import {TrialButton} from './ProMembership';
import {useDiscoveryCopy} from './discoveryCopy';
import {useLocale} from '@/src/contexts/LocaleContext';
import {useAuth} from '@/src/contexts/AuthContext';
import {membershipFailureMessage} from './membershipFailure';
import {recordCheckout} from '@/src/lib/subscription';
import config from '../../../functions/pro-config.json';
import type {BillingCycle,PaymentProvider} from '@/src/types';
import './discovery.css';

type PreviewKind='planner'|'tutor'|'cards'|'analytics';
export function DiscoveryPreview({kind='planner'}:{kind?:PreviewKind}){
 const c=useDiscoveryCopy();
 return <div className={`discovery-preview discovery-preview-${kind}`} aria-label={c.sample}>
  <div className="discovery-preview-bar"><span><span className="discovery-mini-logo">n</span> NOVIQ <b>PRO</b></span><small>{c.sample}</small></div>
  {kind==='planner' && <div className="discovery-demo-plan"><div className="discovery-demo-heading"><CalendarDays size={21}/><strong>{c.goal}</strong></div><div className="discovery-calendar-strip">{['01','02','03','04','05'].map((v,i)=><span key={v} className={i===2?'selected':''}>{v}</span>)}</div><div className="discovery-demo-task"><span className="discovery-demo-check"><Check size={17}/></span><div><strong>{c.task}</strong><span>10:00 – 10:30</span></div><BookOpen size={19}/></div><div className="discovery-demo-next"><span>NOVIQ PRO</span><p>{c.pro1}</p><ArrowRight size={19}/></div></div>}
  {kind==='tutor' && <div className="discovery-demo-chat"><p>{c.prompt}</p><div><MessageCircle size={22}/><p>{c.answer}</p></div><span className="discovery-demo-input">{c.tutor}<ArrowUpRight size={18}/></span></div>}
  {kind==='cards' && <div className="discovery-demo-cards"><span><Layers size={18}/> {c.sample}</span><div><BookOpen size={26}/><strong>{c.front}</strong><p>{c.back}</p></div><small>{c.pro3}</small></div>}
  {kind==='analytics' && <div className="discovery-demo-insight"><ChartNoAxesCombined size={30}/><h3>{c.analytics}</h3><div className="discovery-evidence-flow"><BookOpen/><ArrowRight/><ChartNoAxesCombined/><ArrowRight/><CalendarDays/></div><p>{c.evidence}</p></div>}
  <p className="discovery-preview-note">{c.previewNote}</p>
 </div>;
}

export function ProDiscovery(){
 const m=useMembership(),c=useDiscoveryCopy(),{locale}=useLocale(),{user}=useAuth();
 const [cycle,setCycle]=useState<BillingCycle>('monthly'),[provider,setProvider]=useState<PaymentProvider>('click'),[purchasing,setPurchasing]=useState(false),[paymentError,setPaymentError]=useState(false);
 const owner=useRef(user?.uid);owner.current=user?.uid;const purchaseLock=useRef(false);
 const money=(v:number)=>new Intl.NumberFormat(locale).format(v);
 const scroll=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 const action=()=>m.access.entitled?<a className="discovery-primary" href="#/dashboard">{c.open}<ArrowUpRight size={18}/></a>:!m.available?<button className="discovery-primary" disabled={!m.error} onClick={()=>void m.refresh()}>{m.error?(locale==='uz'?'Qayta urinish':locale==='ru'?'Повторить':'Retry'):c.checking}</button>:m.access.trialEligible?<TrialButton label={c.trial}/>:<button className="discovery-primary" onClick={()=>scroll('discovery-plans')}>{c.purchase}<ArrowUpRight size={18}/></button>;
 const checkout=async()=>{if(!user||purchaseLock.current||!m.access.billing?.providersConfigured)return;const uid=user.uid;purchaseLock.current=true;setPurchasing(true);setPaymentError(false);try{const response=await recordCheckout({userId:uid,billingCycle:cycle,provider,amount:config.prices[cycle]});if(owner.current===uid)location.assign(response.checkoutUrl);}catch{if(owner.current===uid)setPaymentError(true);}finally{purchaseLock.current=false;if(owner.current===uid)setPurchasing(false);}};
 const features:[PreviewKind,React.ElementType,string,string][]=[['planner',CalendarDays,c.planner,c.plannerBody],['tutor',MessageCircle,c.tutor,c.tutorBody],['cards',Layers,c.cards,c.cardsBody],['analytics',ChartNoAxesCombined,c.analytics,c.analyticsBody]];
 return <div className="pro-discovery">
  <section className="discovery-hero" aria-labelledby="discovery-title"><div><span className="discovery-eyebrow">NOVIQ PRO · {config.trialDays} {locale==='uz'?'kun':locale==='ru'?'дней':'days'}</span><h1 id="discovery-title">{c.title}</h1><p className="discovery-lead">{c.intro}</p><div className="discovery-hero-actions">{action()}<button className="discovery-text-link" onClick={()=>scroll('discovery-benefits')}>{c.explore}<ArrowRight size={16}/></button></div><p className="discovery-trust"><ShieldCheck size={17}/>{c.trust}</p></div><div className="discovery-hero-visual"><span className="discovery-visual-caption">{c.workspace}</span><DiscoveryPreview/></div></section>
  {(!m.available||m.error)&&<section className="discovery-verification" aria-live="polite"><p>{m.error?membershipFailureMessage(m.failure,locale):c.checking}</p>{m.error&&<button onClick={()=>void m.refresh()}>{locale==='uz'?'Qayta urinish':locale==='ru'?'Повторить':'Retry'}</button>}</section>}
  {m.available&&!m.access.entitled&&!m.access.trialEligible&&<p className="discovery-verification">{c.used}</p>}
  <section className="discovery-plans" id="discovery-plans" aria-labelledby="discovery-plans-title"><header className="discovery-section-heading"><span className="discovery-eyebrow">FREE / PRO</span><h2 id="discovery-plans-title">{c.planTitle}</h2><p>{c.planIntro}</p></header><div className="discovery-cycle" aria-label={c.planTitle}>{(['monthly','yearly'] as const).map(v=><button key={v} aria-pressed={cycle===v} onClick={()=>setCycle(v)}>{c[v]}</button>)}</div>
  <div className="discovery-plan-grid"><article className="discovery-plan"><div className="discovery-plan-header"><span>{m.available&&m.access.state==='FREE'?c.current:c.freeIntro}</span><h3>{c.free}</h3><p>{c.freeIntro}</p></div><div className="discovery-price"><strong>0</strong><span>UZS / {c[cycle]}</span></div><a className="discovery-secondary" href="#/dashboard">{c.continue}<ArrowRight size={17}/></a><ul>{[c.free1,c.free2,c.free3].map(v=><li key={v}><Check size={18}/>{v}</li>)}</ul></article>
  <article className="discovery-plan discovery-plan-pro"><div className="discovery-plan-header"><span>NOVIQ PRO</span><h3>PRO</h3><p>{c.proIntro}</p></div><div className="discovery-price"><strong>{money(config.prices[cycle])}</strong><span>UZS / {c[cycle]}</span></div>{action()}<ul>{[c.pro1,c.pro2,c.pro3,c.pro4].map(v=><li key={v}><Check size={18}/>{v}</li>)}</ul><p className="discovery-plan-note">{c.after}. {cycle==='yearly'?`${c.saving}: ${money(config.prices.monthly*12-config.prices.yearly)} UZS / ${c.yearly.toLocaleLowerCase()}.`:''}</p><details className="discovery-purchase"><summary>{c.purchase}</summary>{m.access.billing?.providersConfigured?<><label>{c.provider}<select value={provider} onChange={e=>setProvider(e.target.value as PaymentProvider)}><option value="click">Click</option><option value="payme">Payme</option><option value="card">Visa / Mastercard</option></select></label><button className="discovery-secondary" disabled={purchasing} onClick={()=>void checkout()}>{purchasing?'…':c.checkout}</button></>:<p>{c.paymentUnavailable}</p>}{paymentError&&<p role="alert">{c.paymentUnavailable}</p>}</details></article></div></section>
  <section className="discovery-timeline" aria-labelledby="discovery-timeline-title"><header className="discovery-section-heading"><h2 id="discovery-timeline-title">{c.timeline}</h2><p>{c.trust}</p></header><ol>{[[ShieldCheck,c.today,c.todayBody],[BookOpen,c.during,c.duringBody],[Clock3,c.finish,c.finishBody]].map(([Icon,title,body],i)=>{const I=Icon as React.ElementType;return <li key={i}><span className="discovery-step-icon"><I size={24}/></span><h3>{title as string}</h3><p>{body as string}</p></li>;})}</ol></section>
  <section className="discovery-benefits" id="discovery-benefits" aria-labelledby="discovery-benefits-title"><header className="discovery-section-heading"><span className="discovery-eyebrow">NOVIQ PRO</span><h2 id="discovery-benefits-title">{c.benefits}</h2></header>{features.map(([kind,Icon,title,body],i)=><article className={`discovery-benefit ${i%2?'discovery-reverse':''}`} key={kind}><div className="discovery-benefit-copy"><Icon size={28}/><h3>{title}</h3><p>{body}</p></div><DiscoveryPreview kind={kind}/></article>)}</section>
  <section className="discovery-faq" aria-labelledby="discovery-faq-title"><h2 id="discovery-faq-title">{c.faq}</h2><div>{[[c.q1,c.a1],[c.q2,c.finishBody],[c.q3,c.a3],[c.q4,c.a4],[c.q5,c.a5]].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
  <section className="discovery-final"><ShieldCheck size={30}/><h2>{c.final}</h2><p>{c.trust}</p>{action()}<a className="discovery-text-link" href="#/dashboard">{c.continue}<ArrowRight size={16}/></a></section>
 </div>;
}
