import { LanguageId } from '@/state/language-context';

const speechLanguageCodes: Record<LanguageId, string> = {
  english: 'en-IN',
  hindi: 'hi-IN',
  kannada: 'kn-IN',
  tamil: 'ta-IN',
  telugu: 'te-IN',
  marathi: 'mr-IN',
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

export function isWebSpeechSupported() {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function createWebSpeechRecognition({
  language,
  onText,
  onEnd,
  onError,
}: {
  language: LanguageId;
  onText: (text: string) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}) {
  if (!isWebSpeechSupported()) {
    return null;
  }

  const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new Recognition() as BrowserSpeechRecognition;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = speechLanguageCodes[language] ?? 'en-IN';
  let finalText = '';

  recognition.onresult = (event: any) => {
    let interimText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = String(event.results[index][0]?.transcript ?? '').trim();
      if (!transcript) {
        continue;
      }
      if (event.results[index].isFinal) {
        finalText = `${finalText} ${transcript}`.trim();
      } else {
        interimText = `${interimText} ${transcript}`.trim();
      }
    }
    onText(`${finalText} ${interimText}`.trim());
  };

  recognition.onerror = (event: any) => {
    onError?.(String(event.error ?? 'Speech recognition failed.'));
  };
  recognition.onend = () => {
    onEnd?.();
  };

  return recognition;
}
