import { useState } from 'react';
import { RoutePage } from '@/src/components/RoutePage';
import { useLocale } from '@/src/contexts/LocaleContext';
import { getSmartCopy } from './smartPlannerCopy';

const loadSmart = () => import('./SmartPlanner');
const loadLegacy = () => import('@/src/pages/Planner');

export function Planner() {
  const { locale } = useLocale();
  const [legacy, setLegacy] = useState(() => new URLSearchParams(window.location.search).has('examMissions'));
  const copy = getSmartCopy(locale);
  return legacy ? <>
    <button className="sp-button m-4" onClick={() => setLegacy(false)}>{copy.returnSmart}</button>
    <RoutePage loader={loadLegacy} name="LegacyPlanner" />
  </> : <RoutePage loader={loadSmart} name="SmartPlanner" pageProps={{ onLegacy: () => setLegacy(true) }} />;
}
