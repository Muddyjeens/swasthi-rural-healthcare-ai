import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { LanguageId } from '@/state/language-context';

const languageCodes: Record<LanguageId, string> = {
  english: 'en-IN',
  hindi: 'hi-IN',
  kannada: 'kn-IN',
  tamil: 'ta-IN',
  telugu: 'te-IN',
  marathi: 'mr-IN',
};

const languageFallbackCodes: Record<LanguageId, string[]> = {
  english: ['en-IN', 'en-US', 'en'],
  hindi: ['hi-IN', 'hi'],
  kannada: ['kn-IN', 'kn'],
  tamil: ['ta-IN', 'ta'],
  telugu: ['te-IN', 'te'],
  marathi: ['mr-IN', 'mr', 'hi-IN', 'hi'],
};

export async function speakInSelectedLanguage(text: string, language: LanguageId) {
  await Speech.stop();
  if (Platform.OS === 'web' && speakWithBrowserVoice(text, language)) {
    return;
  }
  const speechLanguage = languageCodes[language] ?? 'en-IN';
  const voices = await getExpoVoices();
  const voice = findMatchingVoice(voices, language);

  const speakOptions = {
    language: voice?.language ?? speechLanguage,
    voice: voice?.identifier,
    rate: 0.86,
    pitch: 1,
  };

  const chunks = splitSpeechText(text);
  speakChunkQueue(chunks, speakOptions);
}

export async function stopSpeaking() {
  await Speech.stop();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function splitSpeechText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 220) {
    return [normalized];
  }
  const sentences = normalized.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (`${current} ${sentence}`.trim().length > 220 && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [normalized];
}

function speakChunkQueue(chunks: string[], speakOptions: Speech.SpeechOptions) {
  const [first, ...rest] = chunks;
  if (!first) {
    return;
  }
  Speech.speak(first, {
    ...speakOptions,
    onDone: () => speakChunkQueue(rest, speakOptions),
    onStopped: () => undefined,
    onError: () => undefined,
  });
}

async function getExpoVoices() {
  let voices = await Speech.getAvailableVoicesAsync().catch(() => []);
  if (voices.length > 0) {
    return voices;
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
  voices = await Speech.getAvailableVoicesAsync().catch(() => []);
  return voices;
}

function findMatchingVoice(voices: Speech.Voice[], language: LanguageId) {
  const candidates = languageFallbackCodes[language] ?? ['en-IN'];
  const normalizedCandidates = candidates.map((code) => code.toLowerCase());
  const roots = normalizedCandidates.map((code) => code.split('-')[0]);
  return voices.find((item) => normalizedCandidates.includes(item.language.toLowerCase()))
    ?? voices.find((item) => roots.some((root) => item.language.toLowerCase().startsWith(root)));
}

function speakWithBrowserVoice(text: string, language: LanguageId) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return false;
  }
  const synthesis = window.speechSynthesis;
  const languageCode = languageCodes[language] ?? 'en-IN';
  const chunks = splitSpeechText(text);
  const speak = async () => {
    synthesis.cancel();
    const voices = await getBrowserVoices();
    const voice = findBrowserVoice(voices, language);
    speakBrowserChunkQueue(chunks, languageCode, voice);
  };
  speak();
  return true;
}

function getBrowserVoices() {
  const synthesis = window.speechSynthesis;
  const existing = synthesis.getVoices();
  if (existing.length > 0) {
    return Promise.resolve(existing);
  }
  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const timeout = setTimeout(() => {
      synthesis.onvoiceschanged = null;
      resolve(synthesis.getVoices());
    }, 1200);
    synthesis.onvoiceschanged = () => {
      clearTimeout(timeout);
      synthesis.onvoiceschanged = null;
      resolve(synthesis.getVoices());
    };
  });
}

function findBrowserVoice(voices: SpeechSynthesisVoice[], language: LanguageId) {
  const candidates = languageFallbackCodes[language] ?? ['en-IN'];
  const normalizedCandidates = candidates.map((code) => code.toLowerCase());
  const roots = normalizedCandidates.map((code) => code.split('-')[0]);
  return voices.find((item) => normalizedCandidates.includes(item.lang.toLowerCase()))
    ?? voices.find((item) => roots.some((root) => item.lang.toLowerCase().startsWith(root)))
    ?? null;
}

function speakBrowserChunkQueue(chunks: string[], languageCode: string, voice: SpeechSynthesisVoice | null) {
  const [first, ...rest] = chunks;
  if (!first) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(first);
  utterance.lang = voice?.lang ?? languageCode;
  utterance.voice = voice;
  utterance.rate = 0.86;
  utterance.pitch = 1;
  utterance.onend = () => speakBrowserChunkQueue(rest, languageCode, voice);
  window.speechSynthesis.speak(utterance);
}
