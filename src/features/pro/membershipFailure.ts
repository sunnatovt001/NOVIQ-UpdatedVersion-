export type MembershipFailure = 'offline' | 'session' | 'denied' | 'unavailable' | 'invalid';

export function membershipFailure(error: unknown, online = true): MembershipFailure {
  if (!online) return 'offline';
  const code = String((error as { code?: unknown })?.code || '').replace('functions/', '');
  if (code === 'unauthenticated') return 'session';
  if (code === 'permission-denied') return 'denied';
  if (code === 'invalid-response') return 'invalid';
  return 'unavailable';
}

export function membershipFailureMessage(reason: MembershipFailure | null, locale: string): string {
  const messages = {
    offline: ['You are offline. Reconnect to verify membership. Pending changes remain on this device.', 'Internetga ulanmagansiz. A’zolikni tekshirish uchun qayta ulaning. Kutilayotgan o‘zgarishlar qurilmada saqlanadi.', 'Нет подключения. Подключитесь для проверки подписки. Ожидающие изменения остаются на устройстве.'],
    session: ['Your session could not be verified. Sign in again, then retry membership verification.', 'Sessiyani tekshirib bo‘lmadi. Qayta kiring va a’zolikni tekshiring.', 'Сессия не подтверждена. Войдите снова и повторите проверку подписки.'],
    denied: ['The membership service denied this request. Retry or contact support if it continues.', 'A’zolik xizmati so‘rovni rad etdi. Qayta urining yoki yordam xizmatiga murojaat qiling.', 'Сервис подписки отклонил запрос. Повторите или обратитесь в поддержку.'],
    unavailable: ['Membership verification is temporarily unavailable. Your saved plan is unchanged; paid requests still require server verification.', 'A’zolikni tekshirish vaqtincha ishlamayapti. Saqlangan tarifingiz o‘zgarmagan; pullik so‘rovlar server tasdig‘ini kutadi.', 'Проверка подписки временно недоступна. Сохранённый тариф не изменён; платные запросы требуют проверки сервера.'],
    invalid: ['The membership service returned an incomplete response. Retry verification.', 'A’zolik xizmati to‘liq javob qaytarmadi. Qayta tekshiring.', 'Сервис подписки вернул неполный ответ. Повторите проверку.'],
  };
  return messages[reason || 'unavailable'][locale === 'uz' ? 1 : locale === 'ru' ? 2 : 0];
}
