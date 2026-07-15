import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

export type LanguageId = 'english' | 'hindi' | 'kannada' | 'tamil' | 'telugu' | 'marathi';

export type Language = {
  id: LanguageId;
  nativeName: string;
  englishName: string;
};

export const languages: Language[] = [
  { id: 'english', nativeName: 'English', englishName: 'English' },
  { id: 'hindi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { id: 'kannada', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { id: 'tamil', nativeName: 'தமிழ்', englishName: 'Tamil' },
  { id: 'telugu', nativeName: 'తెలుగు', englishName: 'Telugu' },
  { id: 'marathi', nativeName: 'मराठी', englishName: 'Marathi' },
];

type LanguageContextValue = {
  selectedLanguage: LanguageId;
  selectedLanguageName: string;
  setSelectedLanguage: (language: LanguageId) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageId>('hindi');

  const value = useMemo(() => {
    const selectedLanguageName =
      languages.find((language) => language.id === selectedLanguage)?.englishName ?? 'Hindi';

    return {
      selectedLanguage,
      selectedLanguageName,
      setSelectedLanguage,
    };
  }, [selectedLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return value;
}
