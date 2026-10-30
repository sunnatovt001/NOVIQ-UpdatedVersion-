import type { AppLocale } from '@/src/contexts/LocaleContext';

export function NotebookDraftStatus({locale,conflict,storageError}:{locale:AppLocale;conflict:boolean;storageError:boolean}) {
  return <>
    {conflict && <p role="alert" className="px-6 text-sm text-amber-600">{locale==='uz'?'Qayd boshqa joyda o‘zgargan. Loyihangiz saqlangan; ko‘rib chiqib Saqlash tugmasini bosing.':locale==='ru'?'Заметка изменилась в другом месте. Черновик сохранён; проверьте и нажмите «Сохранить».':'This note changed elsewhere. Your draft is preserved; review it and choose Save to resolve.'}</p>}
    {storageError && <p role="alert" className="px-6 text-sm text-amber-600">{locale==='uz'?'Mahalliy loyiha saqlanmadi. Matnni saqlang yoki nusxalang.':locale==='ru'?'Не удалось сохранить черновик. Сохраните или скопируйте текст.':'The local draft could not be stored. Save or copy your text before leaving.'}</p>}
  </>;
}
