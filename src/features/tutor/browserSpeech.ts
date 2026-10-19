// Optional voice APIs can throw when disabled by browser policy/extensions.
// Their initialization and cleanup must never bring down the text conversation.
export function getTutorSpeechSynthesis(): SpeechSynthesis | null {
  try { return typeof window === 'undefined' ? null : window.speechSynthesis || null; }
  catch { return null; }
}

export function createTutorRecognition(language: string) {
  try {
    const browser = window as typeof window & { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    return recognition;
  } catch { return null; }
}

export function stopTutorRecognition(recognition: { stop?: () => void } | null) {
  try { recognition?.stop?.(); } catch { /* Text Tutor remains available. */ }
}

export function cancelTutorSpeech(synthesis: SpeechSynthesis | null) {
  try { synthesis?.cancel(); } catch { /* Text Tutor remains available. */ }
}
