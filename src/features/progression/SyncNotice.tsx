import { CloudOff, RefreshCw } from 'lucide-react';
import { useLocale } from '@/src/contexts/LocaleContext';
import './progression.css';

// Optional activity/history failures stay in one collapsed notice. Preserve the
// recovery action without showing repeated Retry banners across the page.
export function SyncNotice({message,onRefresh}:{message:string;onRefresh:()=>void}) {
  const {locale}=useLocale();
  return <details className="quiet-sync"><summary><CloudOff size={14} aria-hidden="true"/>{locale==='uz'?'Sinxronlash holati':locale==='ru'?'Статус синхронизации':'Sync status'}</summary><p>{message}</p><button type="button" onClick={onRefresh}><RefreshCw size={14} aria-hidden="true"/>{locale==='uz'?'Yangilash':locale==='ru'?'Обновить':'Refresh'}</button></details>;
}
