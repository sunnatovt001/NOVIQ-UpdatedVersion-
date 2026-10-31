# O‘rnatish — Chrome

1. ZIP’ni alohida papkaga oching.
2. Chrome’da `chrome://extensions` ni oching, Developer mode’ni yoqing.
3. Load unpacked tugmasidan shu papkani tanlang.
4. NOVIQ Focus sahifasini yangilang. “Bloklash kengaytmasi ulangan” yozuvi chiqqach Start’ni bosing.
5. Blokni yechish uchun NOVIQ ichida Exit lock-in tugmasini bosing.

Bu kengaytma boshqa brauzerlar, Windows ilovalari va Chrome ichki sahifalarini bloklamaydi. U ko‘rish tarixini serverga yubormaydi. Focus sahifasi yopilsa yoki aloqa uzilsa, blok avtomatik yechiladi.

# NOVIQ Focus Lock — Chrome extension

1. Extract the ZIP into a permanent folder.
2. Open `chrome://extensions`, enable Developer mode, click Load unpacked and select this folder.
3. Open https://noviqupdated.vercel.app/focus. Confirm the extension-connected message, leave Lock-in enabled and press Start.
4. Other HTTP/HTTPS websites are blocked until Exit lock-in, completion or closing the Focus page. Already loaded tabs retain their page contents behind a temporary blocking layer.

Fullscreen keeps the original Focus page and hides browser tabs/address bar. Leaving fullscreen pauses the timer. The extension continues blocking until you explicitly leave Lock-in on the Focus page; returning and resuming is possible.

Permissions: access to HTTP/HTTPS sites is needed for navigation blocking and the existing-tab overlay. The extension stores only the Focus tab/window ID and a short expiry in browser-session memory. It does not send browsing history or page contents to any server.

Fail-safe: closing/navigating away from the Focus page releases the block. Missing heartbeats expire after 45 seconds, checked at most every 30 seconds. Uninstalling/disabling the extension also releases blocking. Browser internal pages, other browsers and operating-system app switching cannot be locked by this extension. This is voluntary focus assistance, not kiosk/exam-security software.

The owner must install the unpacked extension. It is not installed silently or published to the Chrome Web Store by this package.
