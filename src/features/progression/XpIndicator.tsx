import { Sparkles } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import { useXpSummary } from './useXpSummary';
import './progression.css';

export function XpIndicator() {
  const {user,profile,info}=useXpSummary();
  const {locale}=useLocale();
  if(!user||!profile)return null;
  const hint=locale==='uz'?`${info.xp} XP · ${info.level}-daraja · Keyingi daraja: ${info.nextXp} XP`:locale==='ru'?`${info.xp} XP · Уровень ${info.level} · Следующий: ${info.nextXp} XP`:`${info.xp} XP · Level ${info.level} · Next level: ${info.nextXp} XP`;
  return <a className="xp-indicator" href="/profile#achievements" aria-label={hint} title={hint} data-xp-indicator>
    <Sparkles size={16} aria-hidden="true"/>
    <span aria-live="polite" aria-atomic="true">{info.xp>=10000?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(info.xp):info.xp.toLocaleString()} <small>XP</small></span>
    <span className="xp-indicator-track" aria-hidden="true"><i style={{width:`${info.percent}%`}}/></span>
  </a>;
}
