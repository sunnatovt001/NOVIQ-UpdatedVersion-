# Nexus va Gemini — 2026-10-04

## Nexus

- Guruh nomi yoki members belgisi bosilganda a’zolar oynasi ochiladi.
- Haqiqiy a’zolar soni, ism, mavjud username, owner/member roli va online/oxirgi faollik holati uchun server oqimi qo‘shildi. Username mavjud bo‘lmasa, `Username not set` ko‘rsatiladi; yangi nom o‘ylab topilmaydi.
- Katalog 50 a’zodan sahifalab yuklanadi. Qidiruv yuklangan a’zolar doirasida; Load more va Refresh mavjud. Loading, error, Retry va qidiruvning bo‘sh natijasi ajratilgan.
- `getCommunityMembers` faqat haqiqiy guruh a’zolariga ochiq. Email, Telegram ID, hisob progressi va boshqa private profil maydonlari qaytarilmaydi. Firestore read ruxsatlari kengaytirilmadi.
- `updateCommunityPresence` har bir tab uchun 120 soniyalik lease yuritadi. Ko‘rinadigan, internetga ulangan tab 45 soniyada yangilaydi; yopilgan yoki aloqasi uzilgan tabning lease’i tugaydi. Bir tabning yopilishi boshqa tabni offline qilmaydi. Presence yozuvlari progressdan alohida va server tomonidan cheklangan.
- Online — oxirgi ikki daqiqada aktiv website tabi mavjudligi; Telegramdagi online holat emas. 1,000 a’zodan katta guruhlarda to‘liq online soni hisoblanmaydi, unavailable ko‘rsatiladi. Bunday hajm uchun alohida aggregation arxitekturasi kerak.
- Mobile modal transformlangan sahifa ichida noto‘g‘ri joylashmasligi uchun document body portaliga ko‘chirildi. Escape, fokus qaytishi va yopish tugmasi tekshirildi.

**Live cheklov:** yangi `getCommunityMembers`, `updateCommunityPresence` va oldingi `getCommunityMemberCount` deployment qilinmadi. Brauzerda haqiqiy General xabarlari saqlanib ko‘rinadi, ammo members xizmatining unavailable/Retry holati chiqadi. Shu sababli real guruhlar soni, username va online holati live tarzda hali tasdiqlanmagan. Testlar production yozuvlaridan foydalanmagan. Read-only rejimlarda presence yozilmaydi.

## AI sabab va tuzatish

- Berilgan kalit serverdagi ignored `functions/.env` ga joylandi; qiymati hisobotda yo‘q. `GEMINI_MODELS` — `gemini-3.8-flash`.
- Google models endpoint: HTTP 200.
- Eski `gemini-2.5-flash` generateContent: HTTP 404. Google javobi bu model yangi foydalanuvchilar uchun mavjud emasligini va `gemini-3.8-flash` ga o‘tishni aytdi.
- `gemini-3.8-flash` bilan shaxsiy ma’lumotsiz qisqa so‘rov: HTTP 200, `OK`.
- Plannerga mos title/instructions/speakingPrompt JSON schema so‘rovi: HTTP 200, barcha zarur string maydonlari valid.
- Backend modeli yangilandi; kalit URL query’dan headerga ko‘chirildi. Model, quota va credential xatolari ajratiladi; credential/quota kabi terminal xatolar qayta-qayta yuborilmaydi. Provider xabaridan kalit redakt qilinadi, logda faqat error reason saqlanadi.
- Avvalgi audit rejimi AI so‘rovini ataylab bloklagan. Endi `npm run dev:local-ai` development-only server proxy orqali AI’ni yoqadi, cloud yozuvlarini esa bloklangan holda saqlaydi. Production frontend hamon Firebase callable ishlatadi.
- Proxy faqat loopback va bir xil localhost origin’dan POST qabul qiladi, Firebase ID tokenni tekshiradi, 10 so‘rov/minut limitiga va timeoutga ega. Auth/key/provider xatolari frontendga kalit yoki provider maxfiy body’siz qaytariladi.
- Tutor/Notebook local preview tarixni cloud yoki notebook history cache’ga saqlamaydi; Tutor real kundalik foydalanish hisobini o‘zgartirmaydi. Notebook source material mavjud bo‘lsa, foydalanuvchining o‘zi AI yuborishni bosganda mavjud context oqimi ishlaydi.
- Localhost server `npm run dev:local-ai` bilan ishlamoqda: `http://localhost:3000`.

**Tekshirilmagan:** haqiqiy foydalanuvchi suhbat tarixi yoki notebook materiali bilan live AI so‘rovi yuborilmadi. Real provider kaliti javob bergani va izolyatsiyalangan endpoint/handler testlari foydalanuvchi akkauntidagi butun oqim muvaffaqiyatini o‘zi tasdiqlamaydi. Production AI uchun yangilangan Firebase backend va kalit konfiguratsiyasi keyinchalik deployment qilinishi kerak. Chatga yuborilgan kalitni keyinchalik yangisiga almashtirish tavsiya etiladi.

## Tekshiruvlar

- `npm run verify`: TypeScript, Functions syntax, 38 frontend va 28 backend test (66 jami), production build muvaffaqiyatli.
- Members portal: 390×844, 768×1024, 1366×768, 1920×1080 — overflow yo‘q, Close tugmasi markazi boshqa element bilan yopilmagan. Escape fokusni View group members tugmasiga qaytardi.
- Brauzerda mavjud General, IELTS va SAT entries saqlandi; real messages va backend unavailable/Retry holati ko‘rildi. Haqiqiy Send bosilmadi.
- Local AI endpoint invalid test token bilan HTTP 401 qaytardi; provider xabarini yubormadi.
- Izolyatsiyalangan testlar: a’zolik ruxsati, pagination, private maydonlar yo‘qligi, ko‘p tab lease va expiration, local origin/auth/quota, AI javobi/errorlari, header-only key va model tanlovi.
- Build fayllari secret qiymati bor-yo‘qligiga tekshirildi: secret topilmadi. Tekshiruv qiymatni chop etmagan.
- Git, deployment, production reset/seed/delete bajarilmadi. Presence heartbeat audit/local-AI rejimlarida yuborilmadi.

## O‘zgargan fayllar

`functions/community.js`, `functions/index.js`, `functions/security.test.js`, `functions/.env.example`, ignored `functions/.env`, `src/pages/Community.tsx`, `src/pages/Tutor.tsx`, `src/pages/Notes.tsx`, `src/components/Layout.tsx`, `src/lib/useCommunityPresence.ts`, `src/lib/gemini.ts`, `src/lib/auditMode.ts`, `server/local-ai.cjs`, `vite.config.ts`, `package.json`, `tests/local-ai.test.cjs`, `tests/audit-regression.test.cjs`, `README.md`, ushbu hisobot va `RELEASE_READINESS.md`.

Manbalar: [Google Gemini API key va server-side proxy yo‘riqnomasi](https://ai.google.dev/gemini-api/docs/api-key), [Firebase presence arxitekturasi](https://firebase.google.com/docs/firestore/solutions/presence). Bu loyiha Realtime Database qo‘shmagan; mavjud Firestore va Functions bilan muddati tugaydigan lease ishlatadi.
