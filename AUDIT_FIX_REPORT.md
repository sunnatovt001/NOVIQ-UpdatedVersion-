# NOVIQ lokal audit tuzatishlari

Sana: 2026-10-04. Loyiha: `C:\Users\user\Desktop\NOVIQ`.

Git buyruqlari, push, deployment, seed yoki database reset bajarilmadi. Mavjud guruhlar, xabarlar, note/card yozuvlari va progressni almashtiruvchi migratsiya qo‘shilmadi. Oldindan saqlangan `In progress` holati ham avtomatik reset qilinmadi.

## Audit bandlari

| Band | Tuzatish | Tekshiruv va cheklov |
| --- | --- | --- |
| 1. Saidamin yopishi | Tutor’da takroriy launcher olib tashlandi. Qolgan sahifalarda assistant ekran ustidagi overlay o‘rniga alohida dock joyini egallaydi. Asosiy kontent mustaqil scroll qiladi. | To‘rtta viewport’da Tutor Send markazi Send’ga tushdi. 10 sahifa × 4 o‘lchamda document overflow va ko‘rinadigan tugmalar ustidagi elementlar tekshirildi. |
| 2. Planner AI | Xato yashirin zaxira mashqqa almashtirilmaydi. Ko‘rinadigan alert/Retry, cheklangan kutish, auth/limit/timeout/empty-response xabarlari va JSON/content validation qo‘shildi. Parallel Open/Retry bloklandi. Yangi muvaffaqiyatli AI mashqlari kelib chiqishi bilan belgilanadi; eski mashq shaxsiylashtirilgan AI sifatida e’lon qilinmaydi. | Actual frontend handlerlar va backend izolyatsiyalangan fixture’larda tekshirildi. Brauzerda audit rejimining aniq xatosi va Retry ko‘rindi. Haqiqiy provider so‘rovi yuborilmadi. |
| 3. Open va Start | Open mavjud mashqni ko‘rsatadi; status, elapsed time yoki server study proof yaratmaydi. In progress faqat explicit Start Timer va muvaffaqiyatli server proof’dan keyin o‘rnatiladi. Kechikkan javob boshqa view/taskni boshlamaydi. | Cached/reopen, generation failure/retry, failed/late start, pause va backend completion proof testlari. Brauzerda 00:00 holatidan Complete bajarilmadi; sabablar ko‘rsatildi. |
| 4. Hisoblar | Asossiz Success Probability va forecast uplift olib tashlandi. Dashboard/Planner bir xil saqlangan mission completion manbasi va formuladan foydalanadi. Noma’lum natija real 0%dan ajratiladi. | Ikkala sahifada bir xil 0/5 ko‘rsatildi. Missing/zero/clamped completion testlari. Bu exam success prediction emas. |
| 5. Empty state va scope | Dashboard haqiqiy Planner tasklarini yuklaydi. Notes total, barcha deck kartalari va barcha due kartalar sanaladi. Selected day ko‘rsatkichlari alohida nomlangan. Yuklash/refresh xatosi nol yoki yangi foydalanuvchi empty state’i sifatida taqdim etilmaydi; Retry bor. | Mavjud hisobda 5 task, 1 note, 7 card va 7 due card tasdiqlandi. Note/source/deck/card scope’lari ajratildi. |
| 6. Tavsiyalar | 0 yoki 60 sekunddan qisqa, invalid/pending/cancelled sessionlar completed study evidence sifatida olinmaydi. Soxta retention/confidence, dalilsiz gap/coverage maslahatlari olib tashlandi. Review coverage real reviewCount’dan olinadi. Latest session va saved task ko‘rsatkichlari taxminiy performance sifatida nomlanmaydi. | Zero/invalid/incomplete session, due/review guidance testlari. Brauzerda 0m uchun fake 12% ko‘rinmadi; 7/7 haqiqiy review coverage 100% sifatida ko‘rindi. Eski zero-minute yozuvlar o‘chirilmadi. |
| 7. Kontrast | User message text/Markdown oq, ko‘k fon qat’iy #2563eb. Theme cascade chat matnini qayta to‘q rangga o‘zgartirmaydi. Placeholder/focus va light theme’da juda och aksent matnlari yaxshilandi. | Tutor va Notebook AI light/dark’da rgb(255,255,255) / rgb(37,99,235), taxminan 5.17:1. Nexus va dock ham umumiy chat qoidasidan foydalanadi. |
| 8. Grafiklar | MeasuredChart DOM o‘lchami musbat bo‘lgach render qiladi; ResizeObserver resize/unmountni boshqaradi. Warning yashirilmagan. Current/Last Week haqiqiy boshqa Monday–Sunday davrini hisoblaydi. Hours, 35-day heatmap va 300-record category scope izohlari aniq. | Zero→positive→zero container va cleanup testi, alohida hafta hisoblash testi. To‘rtta o‘lchamda musbat chart dimensions; console’da aniqlangan chart warninglari yo‘q. |
| 9. Nexus data | Legacy root metadata yo‘qligi guruh o‘chirilgan degani emas. Member-only backend count mavjud memberships’dan sanaydi; metadata permission muammosida ham shu cheklangan xizmat ishlatiladi. Muallif nomi real message/profile’dan olinadi; begona profil nomi yoki emaili berilmaydi. Loading, lookup error va deleted/unnamed fallback ajratilgan. | Group membership/count/name privacy backend testlari. General/IELTS mavjud xabarlari va SAT empty state ko‘rildi. Yangi callable jonli muhitga deploy qilinmagan: count va legacy name lookup brauzerda error/Retry holatida qoladi. |
| 10. Notebook accessibility | Close editor/Close AI panel nomlari, 44px yopish boshqaruvlari, textarea nomlari, Escape, source modal Tab trap va opener focus restoration qo‘shildi. | Mobil brauzerda editor→note, AI panel→AI button, source dialog→Link fokus qaytishi va Shift+Tab tekshirildi. |
| 11. Regression | 10 asosiy route barcha talab qilingan o‘lchamlarda ochildi. Blank inputs, Planner navigation/completion guards, deck flip/end, menu/protected refresh, unlinked Telegram tekshirildi. Save va grade uchun synchronous guards qo‘shildi. Card edit review history/due sanasini saqlaydi. | 59 test: 34 frontend, 25 backend. Focus start/pause/resume/restoration/completion va Tutor/Notebook AI success/failure isolated testlarda. Haqiqiy account’dan save/delete/chat send/invite/payment/Telegram delivery bajarilmadi. |

## Lokal tekshiruv natijalari

- `npm run verify`: muvaffaqiyatli — TypeScript (`lint`), Functions syntax lint, 59 test va build.
- Oxirgi chat CSS o‘zgarishidan keyingi `npm run build`: muvaffaqiyatli.
- Browser: 390×844, 768×1024, 1366×768, 1920×1080; har birida Dashboard, Planner, Tutor, Notebook, Decks, Focus Zone, Nexus, Metrics, Pro, Profile.
- Yakuniy layout tekshiruvlarida gorizontal document overflow yoki ko‘rinib turgan enabled tugma markazini yopuvchi element topilmadi. Scroll tashqarisidagi elementlar ko‘rinadigan tugma sifatida hisoblanmadi.
- Tutor’da launcher yo‘q va Send hit-test to‘g‘ri. Laptop Decks’da topilgan Shuffle clipping tor grid/min-width sababini tuzatish bilan bartaraf etildi.
- Chart, ReferenceError, TypeError, Uncaught va Unhandled console tekshiruvlarida yangi JS runtime muammosi qayd etilmadi. Tashqi xizmat/network xatolari bundan alohida; ular yashirilmagan.
- Full page reload’dan keyin mavjud hisob va saqlangan 5 task/1 note/7 card qayta ko‘rindi.
- Firestore emulator suite bu auditda qayta bajarilmadi. Mahalliy Java `1.8.0_51`; emulator uchun mos yangi runtime kerak. Firestore rules bu auditda kengaytirilmadi.

## Ochiq cheklovlar va xavfsizlik

1. `getCommunityMemberCount`ning yangilangan Functions versiyasini keyingi alohida release’da deploy qilib, member count va legacy author lookupni haqiqiy backendda qayta tekshirish kerak. Hozirgi frontend mavjud bo‘lmagan xizmat o‘rniga fake count/name ko‘rsatmaydi.
2. Haqiqiy Gemini muvaffaqiyatli javobi, cloud note/card save, invite acceptance, payment settlement va Telegram delivery foydalanuvchi nomidan bajarilmadi. Mock testlar live credential/provider muvaffaqiyatini isbotlamaydi.
3. Statistikani serverdan olishda vaqtinchalik refresh xatosi kuzatildi va keyingi yangilanishda tiklandi. Error/Retry bor; network xatosini yashirish qo‘shilmadi.
4. Dastlab oddiy dev rejimidagi navigatsiya loyiha ichidagi avtomatik analytics va daily notification yozuvlarini yaratgan bo‘lishi mumkin. Bu aniqlangach keyingi brauzer ishlari alohida read-only audit rejimida bajarildi. Bunday yozuvlarni o‘chirish yoki qaytarish bajarilmadi.
5. Audit rejimi telemetry, notification seed, queued cloud writes/flush, Planner autosave, AI/study writes va bevosita upload/profile/community mutatsiyalarini bloklaydi. Pending offline edits saqlanadi. Hozir localhost shu rejimda ishlamoqda: `npm run dev -- --mode audit`. Oddiy tahrirlash uchun serverni to‘xtatib `npm run dev` ishlatiladi; oddiy dev loyiha mavjud backendiga yozishi mumkin.

## Ushbu auditda o‘zgargan fayllar

Barcha yo‘llar loyiha ildiziga nisbatan:

- UI: `src/components/Layout.tsx`, `src/components/FloatingTutor.tsx`, `src/components/MeasuredChart.tsx` (yangi), `src/index.css`.
- Sahifalar: `src/pages/Dashboard.tsx`, `Planner.tsx`, `Analytics.tsx`, `Community.tsx`, `Tutor.tsx`, `Notes.tsx`, `Flashcards.tsx`, `Profile.tsx`.
- Data/error/accessibility: `src/lib/activityEvidence.ts` (yangi), `asyncRequest.ts` (yangi), `plannerActivity.ts` (yangi), `useDialogFocus.ts` (yangi), `useUserActivityMetrics.ts`, `gemini.ts`.
- Audit xavfsizligi: `src/lib/auditMode.ts` (yangi), `offlineSync.ts`, `analytics.ts`, `progress.ts`, `src/contexts/AuthContext.tsx`.
- Backend: `functions/community.js`, `functions/index.js`, `functions/security.test.js`.
- Regression: `tests/audit-regression.test.cjs` (yangi), `tests/offlineSync.test.cjs`, `tests/profile-bootstrap.test.cjs`.
- Hujjatlar: `README.md`, `RELEASE_READINESS.md`, `AUDIT_FIX_REPORT.md` (yangi).

`dist/` lokal build orqali qayta yaratildi. Production deployment bajarilmadi.
