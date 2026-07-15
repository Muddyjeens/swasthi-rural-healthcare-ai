import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrivacyNotice } from '@/components/privacy-notice';
import { ChatMessagePayload, getPhcRoute, sendChatMessage, transcribeVoice } from '@/services/swasthi-api';
import { LanguageId, useLanguage } from '@/state/language-context';
import { speakInSelectedLanguage, stopSpeaking } from '@/utils/speech';
import { createWebSpeechRecognition, isWebSpeechSupported } from '@/utils/web-speech';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type InputMode = 'voice' | 'chat';
type IntakeStep = 'name' | 'sex' | 'age' | 'complete';

type PatientProfile = {
  name?: string;
  sex?: string;
  age?: string;
};

const maleTerms = [
  'male', 'man', 'boy', 'gentleman', 'mard', 'aadmi', 'admi', 'ladka', 'purush', 'पुरुष', 'आदमी', 'लड़का',
  'gandu', 'huduga', 'ಪುರುಷ', 'ಗಂಡು', 'ಹುಡುಗ', 'aan', 'aanmai', 'paiyan', 'ஆண்', 'பையன்',
  'magadu', 'abbayi', 'purushudu', 'పురుషుడు', 'మగాడు', 'అబ్బాయి', 'aanu', 'purushan', 'ആൺ', 'പുരുഷൻ',
];

const femaleTerms = [
  'female', 'woman', 'girl', 'lady', 'aurat', 'mahila', 'ladki', 'stri', 'stree', 'महिला', 'औरत', 'लड़की',
  'hennu', 'hudugi', 'ಮಹಿಳೆ', 'ಹೆಣ್ಣು', 'ಹುಡುಗಿ', 'pen', 'pennai', 'பெண்', 'பெண்ணை',
  'aadadi', 'ammayi', 'mahila', 'స్త్రీ', 'ఆడది', 'అమ్మాయి', 'pennu', 'sthre', 'സ്ത്രീ', 'പെൺ',
];

const numberWords: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, che: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19,
  bees: 20, tees: 30, chalis: 40, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
};

function normalizeSex(text: string) {
  const value = text.toLowerCase();
  if (femaleTerms.some((term) => value.includes(term.toLowerCase()))) {
    return 'Female';
  }
  if (maleTerms.some((term) => value.includes(term.toLowerCase()))) {
    return 'Male';
  }
  return null;
}

function normalizeAge(text: string) {
  const normalizedDigits = text.replace(/[०-९೦-೯௦-௯౦-౯൦-൯]/g, (digit) => {
    const groups = ['०१२३४५६७८९', '೦೧೨೩೪೫೬೭೮೯', '௦௧௨௩௪௫௬௭௮௯', '౦౧౨౩౪౫౬౭౮౯', '൦൧൨൩൪൫൬൭൮൯'];
    for (const group of groups) {
      const index = group.indexOf(digit);
      if (index >= 0) {
        return String(index);
      }
    }
    return digit;
  });
  const numericMatch = normalizedDigits.match(/\d{1,3}/);
  if (numericMatch) {
    return numericMatch[0];
  }
  const tokens = normalizedDigits.toLowerCase().split(/[\s-]+/);
  const total = tokens.reduce((sum, token) => sum + (numberWords[token] ?? 0), 0);
  return total > 0 ? String(total) : text.trim();
}

const starterByLanguage: Record<string, string> = {
  English: 'Tell me what you are feeling. I will ask one question at a time.',
  Hindi: 'बताइए आपको क्या महसूस हो रहा है। मैं एक बार में एक सवाल पूछूंगा।',
  Kannada: 'ನಿಮಗೆ ಏನು ಅನಿಸುತ್ತಿದೆ ಹೇಳಿ. ನಾನು ಒಂದೊಂದೇ ಪ್ರಶ್ನೆ ಕೇಳುತ್ತೇನೆ.',
  Tamil: 'உங்களுக்கு என்ன உணர்கிறீர்கள் என்று சொல்லுங்கள். நான் ஒரு நேரத்தில் ஒரு கேள்வி கேட்பேன்.',
  Telugu: 'మీకు ఏమి అనిపిస్తోంది చెప్పండి. నేను ఒక్కసారి ఒక ప్రశ్న అడుగుతాను.',
  Marathi: 'तुम्हाला काय वाटत आहे ते सांगा. मी एका वेळी एकच प्रश्न विचारेन.',
};

const intakePrompts: Record<IntakeStep, string> = {
  name: 'Before we start, what is your name?',
  sex: 'What is your sex?',
  age: 'How old are you?',
  complete: 'Tell me what you are feeling. I will ask one question at a time.',
};

const intakePromptsByLanguage: Record<LanguageId, Record<IntakeStep, string>> = {
  english: intakePrompts,
  hindi: {
    name: 'शुरू करने से पहले, आपका नाम क्या है?',
    sex: 'आपका लिंग क्या है?',
    age: 'आपकी उम्र कितनी है?',
    complete: 'बताइए आपको क्या महसूस हो रहा है। मैं एक बार में एक सवाल पूछूंगा।',
  },
  kannada: {
    name: 'ಪ್ರಾರಂಭಿಸುವ ಮೊದಲು, ನಿಮ್ಮ ಹೆಸರು ಏನು?',
    sex: 'ನಿಮ್ಮ ಲಿಂಗ ಯಾವುದು?',
    age: 'ನಿಮ್ಮ ವಯಸ್ಸು ಎಷ್ಟು?',
    complete: 'ನಿಮಗೆ ಏನು ಅನಿಸುತ್ತಿದೆ ಹೇಳಿ. ನಾನು ಒಂದೊಂದೇ ಪ್ರಶ್ನೆ ಕೇಳುತ್ತೇನೆ.',
  },
  tamil: {
    name: 'தொடங்குவதற்கு முன், உங்கள் பெயர் என்ன?',
    sex: 'உங்கள் பாலினம் என்ன?',
    age: 'உங்கள் வயது என்ன?',
    complete: 'உங்களுக்கு என்ன உணர்கிறீர்கள் என்று சொல்லுங்கள். நான் ஒரு நேரத்தில் ஒரு கேள்வி கேட்பேன்.',
  },
  telugu: {
    name: 'ప్రారంభించే ముందు, మీ పేరు ఏమిటి?',
    sex: 'మీ లింగం ఏమిటి?',
    age: 'మీ వయస్సు ఎంత?',
    complete: 'మీకు ఏమి అనిపిస్తోంది చెప్పండి. నేను ఒక్కసారి ఒక ప్రశ్న అడుగుతాను.',
  },
  marathi: {
    name: 'सुरू करण्यापूर्वी, तुमचे नाव काय आहे?',
    sex: 'तुमचे लिंग काय आहे?',
    age: 'तुमचे वय किती आहे?',
    complete: 'तुम्हाला काय वाटत आहे ते सांगा. मी एका वेळी एकच प्रश्न विचारेन.',
  },
};

const promptByLanguage: Record<LanguageId, string> = {
  english: 'What are you feeling? What problem are you having?',
  hindi: 'आपको क्या महसूस हो रहा है? आपको क्या समस्या हो रही है?',
  kannada: 'ನಿಮಗೆ ಏನು ಅನಿಸುತ್ತಿದೆ? ನಿಮಗೆ ಯಾವ ಸಮಸ್ಯೆ ಇದೆ?',
  tamil: 'உங்களுக்கு என்ன உணர்கிறீர்கள்? என்ன பிரச்சனை உள்ளது?',
  telugu: 'మీకు ఏమి అనిపిస్తోంది? మీకు ఏ సమస్య ఉంది?',
  marathi: 'तुम्हाला काय वाटत आहे? तुम्हाला काय त्रास होत आहे?',
};

const conversationCopyByLanguage: Record<LanguageId, {
  symptomAssessment: string;
  name: string;
  sex: string;
  age: string;
  thinking: string;
  disclaimer: string;
  continueCv: string;
  speak: string;
  chat: string;
  heard: string;
  retake: string;
  send: string;
  sending: string;
  mute: string;
  unmute: string;
  listening: string;
  tapToSpeak: string;
  describeSymptom: string;
  handoff: string;
  outOfContext: string;
  invalidName: string;
  invalidSex: string;
  invalidAge: string;
}> = {
  english: {
    symptomAssessment: 'Symptom assessment',
    name: 'Name',
    sex: 'Sex',
    age: 'Age',
    thinking: 'Thinking...',
    disclaimer: 'Swasthi does not diagnose. For danger signs, seek emergency care.',
    continueCv: 'Continue to Computer Vision',
    speak: 'Speak',
    chat: 'Chat',
    heard: 'Heard',
    retake: 'Retake',
    send: 'Send',
    sending: 'Sending...',
    mute: 'Mute',
    unmute: 'Unmute',
    listening: 'Listening carefully. Speak clearly, then tap Mute.',
    tapToSpeak: 'Tap Unmute, speak near the phone, then tap Mute.',
    describeSymptom: 'Describe your symptom',
    handoff: 'MOVING TO COMPUTER VISION WITH AUDIO',
    outOfContext: 'I can help best when you describe a symptom, duration, severity, or visible health concern.',
    invalidName: 'Please enter a real name using letters.',
    invalidSex: 'Please answer sex as male, man, boy, female, woman, or girl.',
    invalidAge: 'Please enter age as a number, like 16. You can say it in words and I will convert it.',
  },
  hindi: {
    symptomAssessment: 'लक्षण जांच',
    name: 'नाम',
    sex: 'लिंग',
    age: 'उम्र',
    thinking: 'सोच रहा है...',
    disclaimer: 'Swasthi निदान नहीं करता। खतरे के संकेत हों तो आपातकालीन देखभाल लें।',
    continueCv: 'कंप्यूटर विज़न पर जाएं',
    speak: 'बोलें',
    chat: 'चैट',
    heard: 'सुना गया',
    retake: 'फिर बोलें',
    send: 'भेजें',
    sending: 'भेज रहा है...',
    mute: 'म्यूट',
    unmute: 'अनम्यूट',
    listening: 'ध्यान से सुन रहा है। साफ़ बोलें, फिर म्यूट दबाएं।',
    tapToSpeak: 'अनम्यूट दबाएं, फोन के पास बोलें, फिर म्यूट दबाएं।',
    describeSymptom: 'अपना लक्षण बताएं',
    handoff: 'ऑडियो के साथ कंप्यूटर विज़न पर जा रहे हैं',
    outOfContext: 'कृपया लक्षण, कितने समय से है, गंभीरता, या दिखाई देने वाली स्वास्थ्य समस्या बताएं।',
    invalidName: 'कृपया अक्षरों में सही नाम दर्ज करें।',
    invalidSex: 'कृपया लिंग पुरुष, लड़का, महिला या लड़की के रूप में बताएं।',
    invalidAge: 'कृपया उम्र संख्या में बताएं, जैसे 16। शब्दों में कहेंगे तो मैं संख्या में बदल दूंगा।',
  },
  kannada: {
    symptomAssessment: 'ಲಕ್ಷಣ ಪರಿಶೀಲನೆ',
    name: 'ಹೆಸರು',
    sex: 'ಲಿಂಗ',
    age: 'ವಯಸ್ಸು',
    thinking: 'ಯೋಚಿಸುತ್ತಿದೆ...',
    disclaimer: 'Swasthi ರೋಗನಿರ್ಣಯ ಮಾಡುವುದಿಲ್ಲ. ಅಪಾಯ ಸೂಚನೆಗಳಿದ್ದರೆ ತುರ್ತು ಚಿಕಿತ್ಸೆ ಪಡೆಯಿರಿ.',
    continueCv: 'ಕಂಪ್ಯೂಟರ್ ವಿಜನ್‌ಗೆ ಮುಂದುವರಿಸಿ',
    speak: 'ಮಾತನಾಡಿ',
    chat: 'ಚಾಟ್',
    heard: 'ಕೇಳಿದೆ',
    retake: 'ಮತ್ತೆ ಹೇಳಿ',
    send: 'ಕಳುಹಿಸಿ',
    sending: 'ಕಳುಹಿಸುತ್ತಿದೆ...',
    mute: 'ಮ್ಯೂಟ್',
    unmute: 'ಅನ್‌ಮ್ಯೂಟ್',
    listening: 'ಗಮನದಿಂದ ಕೇಳುತ್ತಿದೆ. ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ, ನಂತರ ಮ್ಯೂಟ್ ಒತ್ತಿ.',
    tapToSpeak: 'ಅನ್‌ಮ್ಯೂಟ್ ಒತ್ತಿ, ಫೋನ್ ಹತ್ತಿರ ಮಾತನಾಡಿ, ನಂತರ ಮ್ಯೂಟ್ ಒತ್ತಿ.',
    describeSymptom: 'ನಿಮ್ಮ ಲಕ್ಷಣವನ್ನು ವಿವರಿಸಿ',
    handoff: 'ಆಡಿಯೊ ಜೊತೆಗೆ ಕಂಪ್ಯೂಟರ್ ವಿಜನ್‌ಗೆ ಸಾಗುತ್ತಿದೆ',
    outOfContext: 'ದಯವಿಟ್ಟು ಲಕ್ಷಣ, ಎಷ್ಟು ಸಮಯದಿಂದ ಇದೆ, ತೀವ್ರತೆ, ಅಥವಾ ಕಾಣುವ ಆರೋಗ್ಯ ಸಮಸ್ಯೆಯನ್ನು ಹೇಳಿ.',
    invalidName: 'ದಯವಿಟ್ಟು ಅಕ್ಷರಗಳಲ್ಲಿ ಸರಿಯಾದ ಹೆಸರು ನಮೂದಿಸಿ.',
    invalidSex: 'ದಯವಿಟ್ಟು ಲಿಂಗವನ್ನು ಪುರುಷ, ಹುಡುಗ, ಮಹಿಳೆ ಅಥವಾ ಹುಡುಗಿ ಎಂದು ಹೇಳಿ.',
    invalidAge: 'ದಯವಿಟ್ಟು ವಯಸ್ಸನ್ನು 16 ರೀತಿಯ ಸಂಖ್ಯೆಯಲ್ಲಿ ನಮೂದಿಸಿ. ಪದಗಳಲ್ಲಿ ಹೇಳಿದರೆ ಅದನ್ನು ಸಂಖ್ಯೆಗೆ ಬದಲಿಸುತ್ತೇನೆ.',
  },
  tamil: {
    symptomAssessment: 'அறிகுறி மதிப்பீடு',
    name: 'பெயர்',
    sex: 'பாலினம்',
    age: 'வயது',
    thinking: 'யோசிக்கிறது...',
    disclaimer: 'Swasthi நோயறிதல் செய்யாது. ஆபத்து அறிகுறிகள் இருந்தால் அவசர சிகிச்சை பெறுங்கள்.',
    continueCv: 'கணினி பார்வைக்கு செல்லவும்',
    speak: 'பேசு',
    chat: 'அரட்டை',
    heard: 'கேட்டது',
    retake: 'மீண்டும்',
    send: 'அனுப்பு',
    sending: 'அனுப்புகிறது...',
    mute: 'ம்யூட்',
    unmute: 'அன்ம்யூட்',
    listening: 'கவனமாக கேட்கிறது. தெளிவாக பேசவும், பிறகு ம்யூட் அழுத்தவும்.',
    tapToSpeak: 'அன்ம்யூட் அழுத்தி, போனுக்கு அருகில் பேசவும், பிறகு ம்யூட் அழுத்தவும்.',
    describeSymptom: 'உங்கள் அறிகுறியை விவரிக்கவும்',
    handoff: 'ஆடியோவுடன் கணினி பார்வைக்கு செல்கிறது',
    outOfContext: 'அறிகுறி, எவ்வளவு காலமாக உள்ளது, தீவிரம், அல்லது தெரியும் உடல்நல பிரச்சினையைச் சொல்லுங்கள்.',
    invalidName: 'தயவுசெய்து எழுத்துகளில் உண்மையான பெயரை உள்ளிடுங்கள்.',
    invalidSex: 'பாலினத்தை ஆண், பையன், பெண் அல்லது பெண் குழந்தை என சொல்லுங்கள்.',
    invalidAge: 'வயதை 16 போன்ற எண்ணாக உள்ளிடுங்கள். சொற்களாக சொன்னால் எண்ணாக மாற்றுவேன்.',
  },
  telugu: {
    symptomAssessment: 'లక్షణాల అంచనా',
    name: 'పేరు',
    sex: 'లింగం',
    age: 'వయస్సు',
    thinking: 'ఆలోచిస్తోంది...',
    disclaimer: 'Swasthi నిర్ధారణ చేయదు. ప్రమాద సూచనలు ఉంటే అత్యవసర చికిత్స పొందండి.',
    continueCv: 'కంప్యూటర్ విజన్‌కు వెళ్లండి',
    speak: 'మాట్లాడండి',
    chat: 'చాట్',
    heard: 'విన్నది',
    retake: 'మళ్లీ',
    send: 'పంపండి',
    sending: 'పంపుతోంది...',
    mute: 'మ్యూట్',
    unmute: 'అన్‌మ్యూట్',
    listening: 'జాగ్రత్తగా వింటోంది. స్పష్టంగా మాట్లాడి, తర్వాత మ్యూట్ నొక్కండి.',
    tapToSpeak: 'అన్‌మ్యూట్ నొక్కి, ఫోన్ దగ్గర మాట్లాడి, తర్వాత మ్యూట్ నొక్కండి.',
    describeSymptom: 'మీ లక్షణాన్ని వివరించండి',
    handoff: 'ఆడియోతో కంప్యూటర్ విజన్‌కు వెళ్తోంది',
    outOfContext: 'దయచేసి లక్షణం, ఎంతకాలంగా ఉంది, తీవ్రత, లేదా కనిపించే ఆరోగ్య సమస్యను చెప్పండి.',
    invalidName: 'దయచేసి అక్షరాలతో నిజమైన పేరును నమోదు చేయండి.',
    invalidSex: 'దయచేసి లింగాన్ని పురుషుడు, అబ్బాయి, మహిళ లేదా అమ్మాయి గా చెప్పండి.',
    invalidAge: 'దయచేసి వయస్సును 16 లాంటి సంఖ్యగా నమోదు చేయండి. మాటల్లో చెబితే సంఖ్యగా మారుస్తాను.',
  },
  marathi: {
    symptomAssessment: 'लक्षण तपासणी',
    name: 'नाव',
    sex: 'लिंग',
    age: 'वय',
    thinking: 'विचार करत आहे...',
    disclaimer: 'Swasthi निदान करत नाही. धोक्याची चिन्हे असल्यास आपत्कालीन काळजी घ्या.',
    continueCv: 'कंप्यूटर व्हिजनकडे जा',
    speak: 'बोला',
    chat: 'चॅट',
    heard: 'ऐकले',
    retake: 'पुन्हा बोला',
    send: 'पाठवा',
    sending: 'पाठवत आहे...',
    mute: 'म्यूट',
    unmute: 'अनम्यूट',
    listening: 'लक्षपूर्वक ऐकत आहे. स्पष्ट बोला, मग म्यूट दाबा.',
    tapToSpeak: 'अनम्यूट दाबा, फोनजवळ बोला, मग म्यूट दाबा.',
    describeSymptom: 'तुमचे लक्षण सांगा',
    handoff: 'ऑडिओसह कंप्यूटर व्हिजनकडे जात आहे',
    outOfContext: 'कृपया लक्षण, किती वेळापासून आहे, तीव्रता किंवा दिसणारी आरोग्य समस्या सांगा.',
    invalidName: 'कृपया अक्षरांमध्ये खरे नाव लिहा.',
    invalidSex: 'कृपया लिंग पुरुष, मुलगा, महिला किंवा मुलगी असे सांगा.',
    invalidAge: 'कृपया वय 16 सारख्या संख्येत द्या. शब्दांत सांगितल्यास मी ते संख्येत बदलेन.',
  },
};

const healthContextTerms = [
  'pain', 'fever', 'cough', 'headache', 'ache', 'burning', 'sensation', 'burn', 'leukemia', 'cancer', 'tumor',
  'vomit', 'nausea', 'diarrhea', 'stool', 'rash', 'itch', 'skin', 'bruise', 'bruising', 'injury', 'injured',
  'wound', 'cut', 'bleeding', 'swollen', 'swelling', 'breath', 'breathing', 'chest', 'throat', 'temperature', 'temp', 'weak', 'dizzy', 'dizziness', 'dizzy ness',
  'lightheaded', 'light headed', 'vertigo', 'giddy', 'faint', 'fainting', 'urine', 'blood',
  'leg', 'arm', 'hand', 'foot', 'feet', 'toe', 'finger', 'knee', 'ankle', 'elbow', 'shoulder', 'hip', 'back', 'neck', 'face', 'eye', 'ear', 'mouth',
  'patient', 'symptom', 'sick', 'unwell', 'hours', 'days', 'old', '101', '102', '103', '104',
  'दर्द', 'बुखार', 'खांसी', 'सांस', 'लक्षण', 'मरीज', 'उम्र', 'तापमान', 'पेट', 'सिर', 'छाती', 'जलन', 'उल्टी', 'दस्त',
  'पेशाब', 'घाव', 'सूजन', 'नील', 'ಹೊಟ್ಟೆ', 'ನೋವು', 'ಜ್ವರ', 'ಕೆಮ್ಮು', 'ಉಸಿರು', 'ಗಾಯ', 'ಊತ',
  'வயிறு', 'வலி', 'காய்ச்சல்', 'இருமல்', 'மூச்சு', 'காயம்', 'வீக்கம்',
  'కడుపు', 'నొప్పి', 'జ్వరం', 'దగ్గు', 'శ్వాస', 'గాయం', 'వాపు',
  'पोट', 'डोके', 'खोकला', 'श्वास', 'लघवी', 'जखम', 'सूज',
];

const unrelatedContextTerms = [
  'match', 'game', 'won', 'score', 'movie', 'song', 'weather', 'politics', 'cricket', 'football',
];

const swasthiLogo = require('../../assets/images/swasthi-logo.png');
const MIN_DIAGNOSTIC_QUESTIONS = 5;

export default function ConversationScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Message>>(null);
  const { selectedLanguage, selectedLanguageName } = useLanguage();
  const copy = conversationCopyByLanguage[selectedLanguage];
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webRecognition = useRef<ReturnType<typeof createWebSpeechRecognition> | null>(null);
  const webTranscript = useRef('');
  const pulse = useRef(new Animated.Value(0)).current;
  const [input, setInput] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [isSending, setIsSending] = useState(false);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [isWebListening, setIsWebListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [pendingVoiceText, setPendingVoiceText] = useState('');
  const [intakeStep, setIntakeStep] = useState<IntakeStep>('name');
  const [patientProfile, setPatientProfile] = useState<PatientProfile>({});
  const [isConversationComplete, setIsConversationComplete] = useState(false);
  const [geoHandoffMessage, setGeoHandoffMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: intakePrompts.name,
    },
  ]);
  const promptText =
    intakeStep === 'complete'
      ? promptByLanguage[selectedLanguage]
      : intakePromptsByLanguage[selectedLanguage][intakeStep];

  const history = useMemo<ChatMessagePayload[]>(
    () =>
      messages
        .filter((message) => message.id !== 'welcome')
        .slice(-24)
        .map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert('Microphone permission is needed to speak your problem.');
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    })();
  }, []);

  useEffect(() => {
    if (intakeStep !== 'name' || messages.some((message) => message.role === 'user')) {
      return;
    }
    const localizedWelcome = intakePromptsByLanguage[selectedLanguage].name;
    if (messages[0]?.content === localizedWelcome) {
      return;
    }
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: localizedWelcome,
      },
    ]);
  }, [intakeStep, messages, selectedLanguage]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 820,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 820,
          easing: Easing.in(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    speakInSelectedLanguage(promptText, selectedLanguage);

    return () => {
      animation.stop();
      clearAutoStopTimer();
      webRecognition.current?.abort();
      stopSpeaking();
    };
  }, [promptText, pulse, selectedLanguage]);

  function clearAutoStopTimer() {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
  }

  async function handleIntakeAnswer(trimmed: string) {
    let nextStep: IntakeStep = 'sex';
    let nextPrompt = intakePromptsByLanguage[selectedLanguage].sex;

    if (intakeStep === 'name') {
      const patientName = extractPatientName(trimmed);
      if (!isValidName(patientName)) {
        appendAssistantWarning(copy.invalidName);
        return;
      }
      setPatientProfile((current) => ({ ...current, name: patientName }));
    } else if (intakeStep === 'sex') {
      const normalizedSex = normalizeSex(trimmed);
      if (!normalizedSex) {
        appendAssistantWarning(copy.invalidSex);
        return;
      }
      setPatientProfile((current) => ({ ...current, sex: normalizedSex }));
      nextStep = 'age';
      nextPrompt = intakePromptsByLanguage[selectedLanguage].age;
    } else if (intakeStep === 'age') {
      const normalizedAge = normalizeAge(trimmed);
      if (!isValidAge(normalizedAge)) {
        appendAssistantWarning(copy.invalidAge);
        return;
      }
      setPatientProfile((current) => ({ ...current, age: normalizedAge }));
      nextStep = 'complete';
      nextPrompt = starterByLanguage[selectedLanguageName] ?? intakePromptsByLanguage[selectedLanguage].complete;
    }

    setIntakeStep(nextStep);
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: nextPrompt,
      },
    ]);
  }

  function appendAssistantWarning(content: string) {
    setMessages((current) => [
      ...current,
      {
        id: `intake-warning-${Date.now()}`,
        role: 'assistant',
        content,
      },
    ]);
    speakInSelectedLanguage(content, selectedLanguage);
  }

  function isValidName(value: string) {
    return /[A-Za-z\u0900-\u097F\u0C80-\u0CFF\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F]{2,}/.test(value)
      && !/^\d+$/.test(value.trim());
  }

  function extractPatientName(value: string) {
    const cleaned = value
      .trim()
      .replace(/^(my name is|my name's|i am|i'm|this is|patient name is)\s+/i, '')
      .replace(/^(मेरा नाम|मेरा नाम है|मैं|मी|माझे नाव|माझे नाव आहे)\s+/i, '')
      .replace(/[.。।]+$/g, '')
      .trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    return words.slice(0, 3).join(' ');
  }

  function isValidAge(value: string) {
    if (!/^\d{1,3}$/.test(value)) {
      return false;
    }
    const age = Number(value);
    return age >= 0 && age <= 120;
  }

  async function submitMessage(text: string, speakReply = inputMode === 'voice') {
    const trimmed = text.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');

    if (intakeStep !== 'complete') {
      await handleIntakeAnswer(trimmed);
      return;
    }

    if (isOutOfContext(trimmed)) {
      setMessages((current) => [
        ...current,
        {
          id: `context-warning-${Date.now()}`,
          role: 'assistant',
          content: copy.outOfContext,
        },
      ]);
      if (speakReply) {
        speakInSelectedLanguage(copy.outOfContext, selectedLanguage);
      }
      return;
    }

    setIsSending(true);

    try {
      const diagnosisMessageCount = Math.max(0, messages.filter((message) => message.role === 'user').length - 3) + 1;
      const profileContext = [
        patientProfile.name ? `Patient name: ${patientProfile.name}` : '',
        patientProfile.sex ? `Sex: ${patientProfile.sex}` : '',
        patientProfile.age ? `Age: ${patientProfile.age}` : '',
      ].filter(Boolean).join('\n');
      const response = await sendChatMessage({
        message: profileContext ? `${profileContext}\n\nPatient symptom message: ${trimmed}` : trimmed,
        language: selectedLanguageName,
        history,
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.reply,
        },
      ]);
      if (speakReply) {
        speakInSelectedLanguage(response.reply, selectedLanguage);
      }
      if (shouldMoveToGeospatial(response)) {
        await moveToGeospatialForEmergency(0.99, speakReply);
        return;
      }
      if (!isConversationComplete && shouldMoveToComputerVision(response, diagnosisMessageCount)) {
        setIsConversationComplete(true);
        const successMessage = copy.handoff;
        const photoPrompt = buildPhotoPrompt(response.structured_symptoms, trimmed);
        const assessmentHistory = [...messages, userMessage]
          .slice(-18)
          .map((messageItem) => `${messageItem.role}:${messageItem.content}`)
          .join('\n');
        setMessages((current) => [
          ...current,
          {
            id: `handoff-${Date.now()}`,
            role: 'assistant',
            content: successMessage,
          },
        ]);
        if (speakReply) {
          speakInSelectedLanguage(successMessage, selectedLanguage);
        }
        Alert.alert('Success', successMessage);
        setTimeout(() => {
          router.push({
            pathname: '/computer-vision',
            params: { prompt: photoPrompt, chat: assessmentHistory, patient: JSON.stringify(patientProfile) },
          });
        }, 900);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach Swasthi backend.';
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `I could not connect to the health assistant. ${message}`,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleSend() {
    await submitMessage(input, false);
  }

  function moveToComputerVision() {
    const message = copy.handoff;
    speakInSelectedLanguage(message, selectedLanguage);
    setMessages((current) => [
      ...current,
      {
        id: `manual-cv-${Date.now()}`,
        role: 'assistant',
        content: message,
      },
    ]);
    setTimeout(() => {
      const assessmentHistory = messages
        .slice(-18)
        .map((messageItem) => `${messageItem.role}:${messageItem.content}`)
        .join('\n');
      router.push({ pathname: '/computer-vision', params: { chat: assessmentHistory, patient: JSON.stringify(patientProfile) } });
    }, 650);
  }

  async function sendPendingVoice() {
    const text = pendingVoiceText.trim();
    if (!text) {
      return;
    }
    setPendingVoiceText('');
    setLiveTranscript('');
    await submitMessage(text, true);
  }

  function retakeVoice() {
    setPendingVoiceText('');
    setLiveTranscript('');
    webTranscript.current = '';
  }

  function shouldMoveToComputerVision(response: Awaited<ReturnType<typeof sendChatMessage>>, diagnosisMessageCount: number) {
    if (response.should_escalate) {
      return false;
    }
    const reply = response.reply.toLowerCase();
    const isFollowUpQuestion = reply.includes('?');
    const explicitHandoff = reply.includes('continue to computer vision') || reply.includes('computer vision');
    return explicitHandoff || (
      diagnosisMessageCount > MIN_DIAGNOSTIC_QUESTIONS
      && response.structured_symptoms.length > 0
      && !isFollowUpQuestion
    );
  }

  function shouldMoveToGeospatial(response: Awaited<ReturnType<typeof sendChatMessage>>) {
    const reply = response.reply.toLowerCase();
    return response.should_escalate || reply.includes('urgent') || reply.includes('emergency care');
  }

  async function moveToGeospatialForEmergency(confidence: number, speakReply: boolean) {
    if (isConversationComplete) {
      return;
    }
    setIsConversationComplete(true);
    const message = buildGeospatialHandoffMessage();
    setGeoHandoffMessage(message);
    setMessages((current) => [
      ...current,
      {
        id: `geo-handoff-${Date.now()}`,
        role: 'assistant',
        content: message,
      },
    ]);
    if (speakReply) {
      speakInSelectedLanguage(message, selectedLanguage);
    }
    try {
      const route = await getPhcRoute({});
      setTimeout(() => {
        router.push({
          pathname: '/geospatial-analysis',
          params: {
            route: JSON.stringify(route),
            confidence: String(confidence || 0.99),
          },
        });
      }, 3600);
    } catch {
      setTimeout(() => {
        router.push('/geospatial-analysis');
      }, 3600);
    }
  }

  function buildGeospatialHandoffMessage() {
    if (selectedLanguage === 'hindi') {
      return 'उच्च जोखिम। नज़दीकी प्राथमिक स्वास्थ्य केंद्र खोज रहा है।';
    }
    if (selectedLanguage === 'kannada') {
      return 'ಹೆಚ್ಚಿನ ಅಪಾಯ. ಹತ್ತಿರದ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ ಹುಡುಕುತ್ತಿದೆ.';
    }
    if (selectedLanguage === 'tamil') {
      return 'அதிக ஆபத்து. அருகிலுள்ள முதன்மை சுகாதார மையம் தேடப்படுகிறது.';
    }
    if (selectedLanguage === 'telugu') {
      return 'అధిక ప్రమాదం. సమీప ప్రాథమిక ఆరోగ్య కేంద్రం వెతుకుతోంది.';
    }
    if (selectedLanguage === 'marathi') {
      return 'जास्त धोका. जवळचे प्राथमिक आरोग्य केंद्र शोधत आहे.';
    }
    return 'High risk. Finding nearest Primary Health Centre.';
  }

  function localizeProfileSex(value: string, language: LanguageId) {
    const labels = {
      Male: {
        english: 'Male',
        hindi: 'पुरुष',
        kannada: 'ಪುರುಷ',
        tamil: 'ஆண்',
        telugu: 'పురుషుడు',
        marathi: 'पुरुष',
      },
      Female: {
        english: 'Female',
        hindi: 'महिला',
        kannada: 'ಮಹಿಳೆ',
        tamil: 'பெண்',
        telugu: 'మహిళ',
        marathi: 'महिला',
      },
    };
    return labels[value as 'Male' | 'Female']?.[language] ?? value;
  }

  function isOutOfContext(text: string) {
    const normalized = text.toLowerCase();
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')?.content.toLowerCase() ?? '';
    if (isLikelyAnswerToLastQuestion(normalized, lastAssistant)) {
      return false;
    }
    if (looksLikeHealthStatement(normalized)) {
      return false;
    }
    return !healthContextTerms.some((term) => normalized.includes(term.toLowerCase()));
  }

  function looksLikeHealthStatement(text: string) {
    const hasPatientPhrase =
      /\b(i|i'm|im|me|my|patient|he|she|they|we)\b/.test(text)
      || /\b(have|has|having|feel|feeling|got|developed|noticed|suffering|hurts?|injured?)\b/.test(text);
    const hasKnownHealthTerm = healthContextTerms.some((term) => text.includes(term.toLowerCase()));
    const hasMedicalPattern =
      /\b(bruise|bruising|rash|wound|cut|swelling|swollen|pain|fever|cough|blood|vomit|burn|itch|ache|injur|sore|infection|lesion|dizz|lightheaded|vertigo|giddy|faint)\b/.test(text)
      || /\b(left|right)\s+(leg|arm|hand|foot|eye|knee|ankle|shoulder|hip|side|finger|toe)\b/.test(text);
    return hasPatientPhrase && (hasKnownHealthTerm || hasMedicalPattern);
  }

  function isLikelyAnswerToLastQuestion(text: string, lastAssistant: string) {
    if (!lastAssistant) {
      return false;
    }
    if (unrelatedContextTerms.some((term) => text.includes(term))) {
      return false;
    }
    if ((
      lastAssistant.includes('how long')
      || lastAssistant.includes('how many days')
      || lastAssistant.includes('कब से')
      || lastAssistant.includes('कितने समय')
      || lastAssistant.includes('ಎಷ್ಟು ಸಮಯ')
      || lastAssistant.includes('எவ்வளவு நேர')
      || lastAssistant.includes('ఎంతకాల')
      || lastAssistant.includes('किती वेळ')
    ) && (
      /\b\d+\s*(hour|hours|hr|hrs|day|days|week|weeks|month|months)\b/.test(text)
      || /\b(today|yesterday|morning|evening|night|since|few hours|five hours|one day|two days|a day|about a day|around a day|like a day)\b/.test(text)
      || /\d+\s*(दिन|दीन|घंटे|घण्टे|सप्ताह|महीने|ಗಂಟೆ|ದಿನ|ವಾರ|ತಿಂಗಳು|மணி|நாள்|வாரம்|மாதம்|గంట|రోజు|వారం|నెల|तास|दिवस|आठवडा|महिना)/.test(text)
      || /(आज|कल|परसों|सुबह|शाम|रात|आजपासून|कालपासून|ಇಂದು|ನಿನ್ನೆ|காலை|நேற்று|இன்று|నిన్న|ఈరోజు|काल|आज)/.test(text)
    )) {
      return true;
    }
    if (lastAssistant.includes('temperature')) {
      return /\b(9[5-9]|10[0-9]|11[0-2])\s*(f|°f|fahrenheit)?\b/.test(text)
        || (lastAssistant.includes('old') && /\b\d{1,3}\s*(yr|yrs|year|years|old)\b/.test(text))
        || /\b(didn'?t|didnt|do not|don'?t|dont|not|never|no)\s+(measure|check|take|know)\b/.test(text)
        || /\b(not measured|not checked|no thermometer|without thermometer|didn'?t measure|didnt measure)\b/.test(text)
        || /(नहीं\s*(मापा|नापा)|मापा\s*नहीं|थर्मामीटर\s*नहीं|ಗೊತ್ತಿಲ್ಲ|ಅಳೆಯಲಿಲ್ಲ|அளக்கவில்லை|தெரியாது|కొలవలేదు|తెలియదు|मोजले\s*नाही|माहीत\s*नाही)/.test(text);
    }
    if (lastAssistant.includes('how severe') || (lastAssistant.includes('mild') && lastAssistant.includes('moderate'))) {
      return /\b(mild|moderate|medium|severe|low|high|slight|bad|very bad)\b/.test(text);
    }
    if (lastAssistant.includes('dry') || lastAssistant.includes('sputum')) {
      return /\b(dry|sputum|phlegm|mucus|wet|productive)\b/.test(text);
    }
    if (lastAssistant.includes('do you also have') || lastAssistant.includes('loose stools') || lastAssistant.includes('burning while urinating')) {
      return /\b(yes|no|none|nope|nothing|don'?t|do not|dont|any of that|not have|have no|nahi|nahin|illa|illai|ledu)\b/.test(text)
        || /\b(cough|sore throat|chills|vomiting|loose stools|burning|urinating|fever|chest pain|breathing|weakness|pain)\b/.test(text);
    }
    if (lastAssistant.includes('?') && /\b(yes|no|none|nope|nothing|don'?t|do not|dont|not sure|maybe|nahi|nahin|illa|illai|ledu)\b/.test(text)) {
      return true;
    }
    if (lastAssistant.includes('danger signs') || lastAssistant.includes('difficulty breathing')) {
      return /\b(yes|no|none|difficulty|breathing|chest|confusion|seizure|weakness)\b/.test(text);
    }
    return false;
  }

  function buildPhotoPrompt(symptoms: string[], latestMessage: string) {
    const text = `${symptoms.join(' ')} ${latestMessage}`.toLowerCase();
    if (text.includes('rash') || text.includes('skin') || text.includes('itch')) {
      return 'Take clear close-up and slightly wider photos of the affected skin area in bright light.';
    }
    if (text.includes('eye') || text.includes('vision') || text.includes('jaundice')) {
      return 'Take clear photos of both eyes in bright light, without flash glare.';
    }
    if (text.includes('throat') || text.includes('cough') || text.includes('fever')) {
      return 'Take a clear photo of the throat/mouth if visible, and any rash or eye redness if present.';
    }
    if (text.includes('swelling') || text.includes('pain')) {
      return 'Take clear photos of the painful or swollen area from close-up and from a little distance.';
    }
    return 'Take a clear photo of any visible symptom area in bright light. If nothing is visible, continue with text symptoms.';
  }

  async function finishVoiceRecording() {
    if (isVoiceLoading) {
      return;
    }

    try {
      clearAutoStopTimer();
      setIsVoiceLoading(true);
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) {
        throw new Error('Recording was empty. Please try again.');
      }

      const response = await transcribeVoice({ language: selectedLanguageName, uri });
      if (!response.text.trim()) {
        throw new Error('I could not understand the recording. Please try again closer to the microphone.');
      }
      setPendingVoiceText(response.text.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice service is unavailable.';
      setMessages((current) => [
        ...current,
        {
          id: `voice-error-${Date.now()}`,
          role: 'assistant',
          content: message,
        },
      ]);
    } finally {
      setIsVoiceLoading(false);
    }
  }

  async function finishWebSpeech() {
    clearAutoStopTimer();
    webRecognition.current?.stop();
    webRecognition.current = null;
    setIsWebListening(false);
    const transcript = webTranscript.current.trim();
    webTranscript.current = '';
    setLiveTranscript('');
    if (!transcript) {
      setMessages((current) => [
        ...current,
        {
          id: `voice-error-${Date.now()}`,
          role: 'assistant',
          content: 'I could not hear anything clearly. Please tap Unmute and speak close to the phone.',
        },
      ]);
      return;
    }
    setPendingVoiceText(transcript);
  }

  async function handleVoicePress() {
    if (isVoiceLoading) {
      return;
    }

    if (Platform.OS === 'web' && isWebSpeechSupported()) {
      if (isWebListening) {
        await finishWebSpeech();
        return;
      }

      stopSpeaking();
      webTranscript.current = '';
      setLiveTranscript('');
      const recognition = createWebSpeechRecognition({
        language: selectedLanguage,
        onText: (text) => {
          webTranscript.current = text;
          setLiveTranscript(text);
        },
        onError: (message) => {
          setMessages((current) => [
            ...current,
            {
              id: `voice-error-${Date.now()}`,
              role: 'assistant',
              content: `Voice recognition failed: ${message}`,
            },
          ]);
          setIsWebListening(false);
        },
      });
      if (!recognition) {
        return;
      }
      webRecognition.current = recognition;
      recognition.start();
      setIsWebListening(true);
      clearAutoStopTimer();
      autoStopTimer.current = setTimeout(() => {
        finishWebSpeech();
      }, 20000);
      return;
    }

    if (recorderState.isRecording) {
      await finishVoiceRecording();
      return;
    }

    try {
      stopSpeaking();
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      clearAutoStopTimer();
      autoStopTimer.current = setTimeout(() => {
        finishVoiceRecording();
      }, 15000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice recording is unavailable.';
      setMessages((current) => [
        ...current,
        {
          id: `voice-error-${Date.now()}`,
          role: 'assistant',
          content: message,
        },
      ]);
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.keyboardView, { maxWidth: Math.min(width, 430) }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Swasthi AI</Text>
            <Text style={styles.subtitle}>{copy.symptomAssessment} · {selectedLanguageName}</Text>
          </View>
        </View>

        {(patientProfile.name || patientProfile.sex || patientProfile.age) && (
          <View style={styles.patientDetails}>
            <Text style={styles.patientDetailsText} numberOfLines={1}>
              {patientProfile.name ? `${copy.name}: ${patientProfile.name}` : `${copy.name}: -`}
            </Text>
            <Text style={styles.patientDetailsText} numberOfLines={1}>
              {patientProfile.sex ? `${copy.sex}: ${localizeProfileSex(patientProfile.sex, selectedLanguage)}` : `${copy.sex}: -`}
            </Text>
            <Text style={styles.patientDetailsText} numberOfLines={1}>
              {patientProfile.age ? `${copy.age}: ${patientProfile.age}` : `${copy.age}: -`}
            </Text>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.promptPanel}>
              <Animated.View
                style={[
                  styles.promptHalo,
                  {
                    opacity: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.28, 0.02],
                    }),
                    transform: [
                      {
                        scale: pulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.34],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.promptCircle,
                  {
                    transform: [
                      {
                        scale: pulse.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [1, 1.045, 1],
                        }),
                      },
                    ],
                  },
                ]}>
                <Image source={swasthiLogo} style={styles.promptLogo} resizeMode="contain" />
              </Animated.View>
            </View>
          }
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            const isHandoff = item.id.includes('handoff') || item.id.includes('manual-cv');

            return (
              <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble, isHandoff && styles.handoffBubble]}>
                  <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText, isHandoff && styles.handoffText]}>
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            isSending ? (
              <View style={styles.assistantRow}>
                <View style={[styles.bubble, styles.assistantBubble]}>
                  <Text style={styles.assistantText}>{copy.thinking}</Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={styles.disclaimer}>
          {geoHandoffMessage ? (
            <View style={styles.geoHandoffPanel}>
              <Text style={styles.geoHandoffText}>{geoHandoffMessage}</Text>
            </View>
          ) : null}
          <Text style={styles.disclaimerText}>{copy.disclaimer}</Text>
          <PrivacyNotice />
          <Pressable
            accessibilityRole="button"
            onPress={moveToComputerVision}
            style={({ pressed }) => [styles.cvButton, pressed && styles.pressed]}>
            <Text style={styles.cvButtonText}>{copy.continueCv}</Text>
          </Pressable>
        </View>

        <View style={styles.modeRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setInputMode('voice')}
            style={({ pressed }) => [
              styles.modeButton,
              inputMode === 'voice' && styles.modeButtonSelected,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.modeText, inputMode === 'voice' && styles.modeTextSelected]}>{copy.speak}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setInputMode('chat')}
            style={({ pressed }) => [
              styles.modeButton,
              inputMode === 'chat' && styles.modeButtonSelected,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.modeText, inputMode === 'chat' && styles.modeTextSelected]}>{copy.chat}</Text>
          </Pressable>
        </View>

        {inputMode === 'voice' ? (
          <View style={styles.voicePanel}>
            {pendingVoiceText ? (
              <View style={styles.voiceReview}>
                <Text style={styles.voiceReviewLabel}>{copy.heard}</Text>
                <Text style={styles.voiceReviewText}>{pendingVoiceText}</Text>
                <View style={styles.voiceReviewActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={retakeVoice}
                    style={({ pressed }) => [styles.retakeButton, pressed && styles.pressed]}>
                    <Text style={styles.retakeText}>{copy.retake}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={sendPendingVoice}
                    disabled={isSending}
                    style={({ pressed }) => [styles.confirmButton, isSending && styles.sendButtonDisabled, pressed && styles.pressed]}>
                    <Text style={styles.confirmText}>{copy.send}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          <View style={styles.inputRow}>
            {recorderState.isRecording && <View style={styles.recordingDot} />}
            <Pressable
              accessibilityRole="button"
              disabled={isVoiceLoading}
              onPress={handleVoicePress}
              style={({ pressed }) => [
                styles.voiceToggleButton,
                (recorderState.isRecording || isWebListening) && styles.voiceButtonRecording,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.voiceText}>
                {isVoiceLoading ? copy.sending : recorderState.isRecording || isWebListening ? copy.mute : copy.unmute}
              </Text>
            </Pressable>
            <Text style={styles.voiceHint}>
              {liveTranscript ||
                (recorderState.isRecording || isWebListening
                  ? copy.listening
                  : copy.tapToSpeak)}
            </Text>
          </View>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              editable={!isSending}
              multiline
              placeholder={copy.describeSymptom}
              placeholderTextColor="#7A8B78"
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isSending || input.trim().length === 0}
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                (isSending || input.trim().length === 0) && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.sendText}>{copy.send}</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const colors = {
  background: '#F6FAF5',
  green: '#3A683D',
  deepGreen: '#17331C',
  paleGreen: '#DCEED8',
  text: '#17281B',
  muted: '#6E8A6E',
  white: '#FFFFFF',
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE8D9',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paleGreen,
  },
  backText: {
    color: colors.deepGreen,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '700',
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: colors.deepGreen,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  patientDetails: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE8D9',
    backgroundColor: '#EEF7EC',
  },
  patientDetailsText: {
    flex: 1,
    color: colors.deepGreen,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  messageList: {
    padding: 16,
    gap: 12,
  },
  promptPanel: {
    minHeight: 228,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptHalo: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: colors.green,
  },
  promptCircle: {
    width: 156,
    height: 156,
    borderRadius: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: colors.green,
    borderWidth: 1,
    borderColor: '#2F6434',
  },
  promptText: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0,
  },
  promptLogo: {
    width: 124,
    height: 124,
    borderRadius: 62,
  },
  messageRow: {
    flexDirection: 'row',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  userBubble: {
    backgroundColor: colors.green,
    borderBottomRightRadius: 5,
  },
  assistantBubble: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#DCE8D8',
    borderBottomLeftRadius: 5,
  },
  handoffBubble: {
    width: '100%',
    maxWidth: '100%',
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deepGreen,
    borderColor: colors.deepGreen,
    borderBottomLeftRadius: 18,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  },
  userText: {
    color: colors.white,
    fontWeight: '600',
  },
  assistantText: {
    color: colors.text,
    fontWeight: '500',
  },
  handoffText: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  disclaimer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  geoHandoffPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E1A1A1',
    backgroundColor: '#FFF0F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  geoHandoffText: {
    color: colors.deepGreen,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
  },
  disclaimerText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  cvButton: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: colors.paleGreen,
  },
  cvButtonText: {
    color: colors.deepGreen,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#DDE8D9',
    backgroundColor: colors.background,
  },
  voicePanel: {
    borderTopWidth: 1,
    borderTopColor: '#DDE8D9',
    backgroundColor: colors.background,
  },
  voiceReview: {
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
  },
  voiceReviewLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  voiceReviewText: {
    color: colors.deepGreen,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  voiceReviewActions: {
    flexDirection: 'row',
    gap: 10,
  },
  retakeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  retakeText: {
    color: colors.deepGreen,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  confirmButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  confirmText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#DDE8D9',
    backgroundColor: colors.background,
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
  },
  modeButtonSelected: {
    borderColor: colors.green,
    backgroundColor: colors.paleGreen,
  },
  modeText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  modeTextSelected: {
    color: colors.deepGreen,
  },
  input: {
    flex: 1,
    maxHeight: 112,
    minHeight: 46,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
  },
  voiceToggleButton: {
    minWidth: 124,
    minHeight: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paleGreen,
    paddingHorizontal: 16,
  },
  voiceButtonRecording: {
    backgroundColor: '#FFE2E2',
    borderWidth: 1,
    borderColor: '#D64545',
  },
  voiceText: {
    color: colors.deepGreen,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  voiceHint: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D64545',
  },
  sendButton: {
    minHeight: 46,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: colors.green,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.82,
  },
});
