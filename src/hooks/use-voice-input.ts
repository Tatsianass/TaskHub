import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useEffect, useState } from 'react';

import { useLocale } from '@/context/locale-context';
import type { Locale } from '@/i18n/translations';

const SPEECH_LANG: Record<Locale, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-BR',
  zh: 'zh-CN',
};

type Options = {
  /** Called with the full phrase heard so far as it grows, then once more with `isFinal` set. */
  onTranscript: (text: string, isFinal: boolean) => void;
};

export type VoiceError = 'denied' | 'failed' | null;

/** Speech-to-text in the app's language, using the phone's own recognizer. */
export function useVoiceInput({ onTranscript }: Options) {
  const { locale } = useLocale();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceError>(null);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript;
    if (text) onTranscript(text, event.isFinal);
  });
  useSpeechRecognitionEvent('error', (event) => {
    // "aborted" and "no-speech" are the user stopping or staying silent, not failures worth showing.
    if (event.error === 'not-allowed') setError('denied');
    else if (event.error !== 'aborted' && event.error !== 'no-speech') setError('failed');
  });

  const start = useCallback(async () => {
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError('denied');
      return;
    }
    ExpoSpeechRecognitionModule.start({ lang: SPEECH_LANG[locale], interimResults: true, continuous: false });
  }, [locale]);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const abort = useCallback(() => ExpoSpeechRecognitionModule.abort(), []);

  useEffect(() => abort, [abort]);

  return { listening, error, start, stop, abort };
}
