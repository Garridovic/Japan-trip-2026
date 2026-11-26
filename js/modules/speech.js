// Japanese text-to-speech through the Web Speech API (uses the voices installed on the device).
export const NORMAL_RATE = 0.9;
export const SLOW_RATE = 0.5;

export const pickJapaneseVoice = (voices) =>
  voices.find((voice) => voice.lang?.toLowerCase().replace('_', '-') === 'ja-jp')
  ?? voices.find((voice) => voice.lang?.toLowerCase().startsWith('ja'))
  ?? null;

export function createSpeech(win = window) {
  const synth = win.speechSynthesis;
  const Utterance = win.SpeechSynthesisUtterance;
  const supported = Boolean(synth && Utterance);
  const listeners = new Set();
  let voice = null;

  const refresh = () => {
    if (!supported) return;
    voice = pickJapaneseVoice(synth.getVoices());
    listeners.forEach((listener) => listener(status()));
  };
  const status = () => ({ supported, hasJapaneseVoice: Boolean(voice) });

  if (supported) {
    refresh();
    synth.addEventListener?.('voiceschanged', refresh);
  }

  return {
    status,
    /** Calls back now and whenever the list of device voices changes. */
    onChange(listener) { listeners.add(listener); listener(status()); },
    speak(text, { slow = false } = {}) {
      if (!supported) return false;
      synth.cancel();
      const utterance = new Utterance(text);
      utterance.lang = 'ja-JP';
      if (voice) utterance.voice = voice;
      utterance.rate = slow ? SLOW_RATE : NORMAL_RATE;
      synth.speak(utterance);
      return true;
    },
    stop() { if (supported) synth.cancel(); }
  };
}
