import { LanguageId } from '@/state/language-context';

export type ModuleCopy = {
  computerVisionTitle: string;
  takeImage: string;
  choose: string;
  imageHint: string;
  imageTitle: string;
  sayTitle: string;
  mute: string;
  retakeTitle: string;
  submitImage: string;
  submittedImages: string;
  deleteImage: string;
  finalSubmit: string;
  skipVision: string;
  goGeospatial: string;
  downloadReport: string;
  submitting: string;
  addImageFirst: string;
  addTitleFirst: string;
  addClearImageFirst: string;
  imageOutOfContext: string;
  revealKicker: string;
  revealText: string;
  yourZone: string;
  lowRisk: string;
  mediumRisk: string;
  highRisk: string;
  confidence: string;
  homeRemedies: string;
  module4Route: string;
  openRoute: string;
  distanceUnavailable: string;
  awayFromTestOrigin: string;
  geospatialTitle: string;
  nearestPhc: string;
  routeDetails: string;
  backToCv: string;
  resultSummary: (risk: string, imageCount: number) => string;
};

export const moduleCopyByLanguage: Record<LanguageId, ModuleCopy> = {
  english: {
    computerVisionTitle: 'Computer Vision Screening',
    takeImage: 'Take Image',
    choose: 'Choose',
    imageHint: 'Images are resized to 768 px wide for faster upload and clear CV analysis.',
    imageTitle: 'Image title',
    sayTitle: 'Say Title',
    mute: 'Mute',
    retakeTitle: 'Retake Title',
    submitImage: 'Submit Image',
    submittedImages: 'Submitted Images',
    deleteImage: 'Delete',
    finalSubmit: 'Final Submit',
    skipVision: 'Skip Computer Vision',
    goGeospatial: 'Go to Geospatial',
    downloadReport: 'Download Report',
    submitting: 'Submitting...',
    addImageFirst: 'Add at least one image before final submit.',
    addTitleFirst: 'Please add a title for the image.',
    addClearImageFirst: 'Please take a clear image first.',
    imageOutOfContext: 'Please title the image with the visible symptom or body area, not unrelated content.',
    revealKicker: 'Swasthi is opening your zone...',
    revealText: '3 - 2 - 1',
    yourZone: 'Your Zone',
    lowRisk: 'Low Risk',
    mediumRisk: 'Medium Risk',
    highRisk: 'High Risk',
    confidence: 'Model confidence',
    homeRemedies: 'Home Remedies',
    module4Route: 'Module 4 Route',
    openRoute: 'Open Route',
    distanceUnavailable: 'Distance unavailable',
    awayFromTestOrigin: 'km away from test origin',
    geospatialTitle: 'Geospatial Analysis',
    nearestPhc: 'Nearest Primary Health Centre',
    routeDetails: 'Route Details',
    backToCv: 'Back to Computer Vision',
    resultSummary: (risk, imageCount) => `Based on your chat and ${imageCount} submitted image(s), your current zone is ${risk}.`,
  },
  hindi: {
    computerVisionTitle: 'कंप्यूटर विज़न जांच',
    takeImage: 'तस्वीर लें',
    choose: 'चुनें',
    imageHint: 'तेज़ अपलोड और साफ़ जांच के लिए तस्वीर 768 px चौड़ी की जाती है।',
    imageTitle: 'तस्वीर का शीर्षक',
    sayTitle: 'शीर्षक बोलें',
    mute: 'म्यूट',
    retakeTitle: 'शीर्षक फिर बोलें',
    submitImage: 'तस्वीर जमा करें',
    submittedImages: 'जमा तस्वीरें',
    deleteImage: 'हटाएं',
    finalSubmit: 'अंतिम जमा',
    skipVision: 'कंप्यूटर विज़न छोड़ें',
    goGeospatial: 'भू-स्थानिक पर जाएं',
    downloadReport: 'रिपोर्ट डाउनलोड करें',
    submitting: 'जमा हो रहा है...',
    addImageFirst: 'अंतिम जमा से पहले कम से कम एक तस्वीर जोड़ें।',
    addTitleFirst: 'कृपया तस्वीर का शीर्षक जोड़ें।',
    addClearImageFirst: 'कृपया पहले साफ़ तस्वीर लें।',
    imageOutOfContext: 'कृपया तस्वीर का शीर्षक दिख रहे लक्षण या शरीर के हिस्से से दें, असंबंधित बात से नहीं।',
    revealKicker: 'Swasthi आपका ज़ोन खोल रहा है...',
    revealText: '3 - 2 - 1',
    yourZone: 'आपका ज़ोन',
    lowRisk: 'कम जोखिम',
    mediumRisk: 'मध्यम जोखिम',
    highRisk: 'उच्च जोखिम',
    confidence: 'मॉडल विश्वास',
    homeRemedies: 'घरेलू उपाय',
    module4Route: 'मॉड्यूल 4 मार्ग',
    openRoute: 'मार्ग खोलें',
    distanceUnavailable: 'दूरी उपलब्ध नहीं',
    awayFromTestOrigin: 'किमी टेस्ट स्थान से दूर',
    geospatialTitle: 'भू-स्थानिक विश्लेषण',
    nearestPhc: 'सबसे नज़दीकी प्राथमिक स्वास्थ्य केंद्र',
    routeDetails: 'मार्ग विवरण',
    backToCv: 'कंप्यूटर विज़न पर वापस',
    resultSummary: (risk, imageCount) => `आपकी बातचीत और ${imageCount} तस्वीरों के आधार पर आपका वर्तमान ज़ोन ${risk} है।`,
  },
  kannada: {
    computerVisionTitle: 'ಕಂಪ್ಯೂಟರ್ ವಿಜನ್ ಪರಿಶೀಲನೆ',
    takeImage: 'ಚಿತ್ರ ತೆಗೆಯಿರಿ',
    choose: 'ಆಯ್ಕೆಮಾಡಿ',
    imageHint: 'ವೇಗದ ಅಪ್ಲೋಡ್ ಮತ್ತು ಸ್ಪಷ್ಟ ವಿಶ್ಲೇಷಣೆಗೆ ಚಿತ್ರವನ್ನು 768 px ಅಗಲಕ್ಕೆ ಬದಲಿಸಲಾಗುತ್ತದೆ.',
    imageTitle: 'ಚಿತ್ರದ ಶೀರ್ಷಿಕೆ',
    sayTitle: 'ಶೀರ್ಷಿಕೆ ಹೇಳಿ',
    mute: 'ಮ್ಯೂಟ್',
    retakeTitle: 'ಶೀರ್ಷಿಕೆ ಮತ್ತೆ ಹೇಳಿ',
    submitImage: 'ಚಿತ್ರ ಸಲ್ಲಿಸಿ',
    submittedImages: 'ಸಲ್ಲಿಸಿದ ಚಿತ್ರಗಳು',
    deleteImage: 'ಅಳಿಸಿ',
    finalSubmit: 'ಅಂತಿಮ ಸಲ್ಲಿಕೆ',
    skipVision: 'ಕಂಪ್ಯೂಟರ್ ವಿಜನ್ ಬಿಟ್ಟುಹೋಗಿ',
    goGeospatial: 'ಭೂಸ್ಥಳಕ್ಕೆ ಹೋಗಿ',
    downloadReport: 'ವರದಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ',
    submitting: 'ಸಲ್ಲಿಸುತ್ತಿದೆ...',
    addImageFirst: 'ಅಂತಿಮ ಸಲ್ಲಿಕೆಗೆ ಮೊದಲು ಕನಿಷ್ಠ ಒಂದು ಚಿತ್ರ ಸೇರಿಸಿ.',
    addTitleFirst: 'ದಯವಿಟ್ಟು ಚಿತ್ರದ ಶೀರ್ಷಿಕೆ ಸೇರಿಸಿ.',
    addClearImageFirst: 'ದಯವಿಟ್ಟು ಮೊದಲು ಸ್ಪಷ್ಟ ಚಿತ್ರ ತೆಗೆದುಕೊಳ್ಳಿ.',
    imageOutOfContext: 'ದಯವಿಟ್ಟು ಚಿತ್ರಕ್ಕೆ ಕಾಣುವ ಲಕ್ಷಣ ಅಥವಾ ದೇಹದ ಭಾಗದ ಶೀರ್ಷಿಕೆ ನೀಡಿ, ಸಂಬಂಧವಿಲ್ಲದ ವಿಷಯವಲ್ಲ.',
    revealKicker: 'Swasthi ನಿಮ್ಮ ವಲಯವನ್ನು ತೆರೆದಿಡುತ್ತಿದೆ...',
    revealText: '3 - 2 - 1',
    yourZone: 'ನಿಮ್ಮ ವಲಯ',
    lowRisk: 'ಕಡಿಮೆ ಅಪಾಯ',
    mediumRisk: 'ಮಧ್ಯಮ ಅಪಾಯ',
    highRisk: 'ಹೆಚ್ಚಿನ ಅಪಾಯ',
    confidence: 'ಮಾದರಿ ವಿಶ್ವಾಸ',
    homeRemedies: 'ಮನೆಮದ್ದುಗಳು',
    module4Route: 'ಮಾಡ್ಯೂಲ್ 4 ಮಾರ್ಗ',
    openRoute: 'ಮಾರ್ಗ ತೆರೆಯಿರಿ',
    distanceUnavailable: 'ದೂರ ಲಭ್ಯವಿಲ್ಲ',
    awayFromTestOrigin: 'ಕಿಮೀ ಪರೀಕ್ಷಾ ಸ್ಥಳದಿಂದ ದೂರ',
    geospatialTitle: 'ಭೂಸ್ಥಳ ವಿಶ್ಲೇಷಣೆ',
    nearestPhc: 'ಹತ್ತಿರದ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ',
    routeDetails: 'ಮಾರ್ಗ ವಿವರಗಳು',
    backToCv: 'ಕಂಪ್ಯೂಟರ್ ವಿಜನ್‌ಗೆ ಹಿಂದಿರುಗಿ',
    resultSummary: (risk, imageCount) => `ನಿಮ್ಮ ಚಾಟ್ ಮತ್ತು ${imageCount} ಚಿತ್ರಗಳ ಆಧಾರದ ಮೇಲೆ ನಿಮ್ಮ ವಲಯ ${risk}.`,
  },
  tamil: {
    computerVisionTitle: 'கணினி பார்வை பரிசோதனை',
    takeImage: 'படம் எடு',
    choose: 'தேர்வு',
    imageHint: 'வேகமான பதிவேற்றத்திற்கும் தெளிவான பகுப்பாய்விற்கும் படம் 768 px அகலமாக மாற்றப்படும்.',
    imageTitle: 'பட தலைப்பு',
    sayTitle: 'தலைப்பை பேசு',
    mute: 'ம்யூட்',
    retakeTitle: 'தலைப்பை மீண்டும் பேசு',
    submitImage: 'படம் சமர்ப்பி',
    submittedImages: 'சமர்ப்பித்த படங்கள்',
    deleteImage: 'நீக்கு',
    finalSubmit: 'இறுதி சமர்ப்பிப்பு',
    skipVision: 'கணினி பார்வையை தவிர்',
    goGeospatial: 'புவியியல் பகுதிக்கு செல்',
    downloadReport: 'அறிக்கையை பதிவிறக்கு',
    submitting: 'சமர்ப்பிக்கிறது...',
    addImageFirst: 'இறுதி சமர்ப்பிப்புக்கு முன் குறைந்தது ஒரு படம் சேர்க்கவும்.',
    addTitleFirst: 'படத்திற்கான தலைப்பைச் சேர்க்கவும்.',
    addClearImageFirst: 'முதலில் தெளிவான படம் எடுக்கவும்.',
    imageOutOfContext: 'தயவுசெய்து படத்துக்கு தெரியும் அறிகுறி அல்லது உடல் பகுதியை தலைப்பாக இடுங்கள்; தொடர்பில்லாததை அல்ல.',
    revealKicker: 'Swasthi உங்கள் மண்டலத்தை திறக்கிறது...',
    revealText: '3 - 2 - 1',
    yourZone: 'உங்கள் மண்டலம்',
    lowRisk: 'குறைந்த ஆபத்து',
    mediumRisk: 'நடுத்தர ஆபத்து',
    highRisk: 'அதிக ஆபத்து',
    confidence: 'மாதிரி நம்பிக்கை',
    homeRemedies: 'வீட்டு வைத்தியம்',
    module4Route: 'மாட்யூல் 4 பாதை',
    openRoute: 'பாதை திற',
    distanceUnavailable: 'தூரம் கிடைக்கவில்லை',
    awayFromTestOrigin: 'கிமீ சோதனை இடத்திலிருந்து',
    geospatialTitle: 'புவியியல் பகுப்பாய்வு',
    nearestPhc: 'அருகிலுள்ள முதன்மை சுகாதார மையம்',
    routeDetails: 'பாதை விவரங்கள்',
    backToCv: 'கணினி பார்வைக்கு திரும்பு',
    resultSummary: (risk, imageCount) => `உங்கள் உரையாடல் மற்றும் ${imageCount} படங்களின் அடிப்படையில் உங்கள் மண்டலம் ${risk}.`,
  },
  telugu: {
    computerVisionTitle: 'కంప్యూటర్ విజన్ స్క్రీనింగ్',
    takeImage: 'చిత్రం తీయండి',
    choose: 'ఎంచుకోండి',
    imageHint: 'వేగమైన అప్లోడ్ మరియు స్పష్టమైన విశ్లేషణ కోసం చిత్రం 768 px వెడల్పుకు మార్చబడుతుంది.',
    imageTitle: 'చిత్రం శీర్షిక',
    sayTitle: 'శీర్షిక చెప్పండి',
    mute: 'మ్యూట్',
    retakeTitle: 'శీర్షిక మళ్లీ చెప్పండి',
    submitImage: 'చిత్రం సమర్పించండి',
    submittedImages: 'సమర్పించిన చిత్రాలు',
    deleteImage: 'తొలగించు',
    finalSubmit: 'చివరి సమర్పణ',
    skipVision: 'కంప్యూటర్ విజన్ దాటవేయండి',
    goGeospatial: 'భూస్థానికానికి వెళ్లండి',
    downloadReport: 'రిపోర్ట్ డౌన్‌లోడ్ చేయండి',
    submitting: 'సమర్పిస్తోంది...',
    addImageFirst: 'చివరి సమర్పణకు ముందు కనీసం ఒక చిత్రం జోడించండి.',
    addTitleFirst: 'దయచేసి చిత్రానికి శీర్షిక జోడించండి.',
    addClearImageFirst: 'ముందుగా స్పష్టమైన చిత్రం తీయండి.',
    imageOutOfContext: 'దయచేసి చిత్రానికి కనిపించే లక్షణం లేదా శరీర భాగం పేరును పెట్టండి, సంబంధం లేని విషయాన్ని కాదు.',
    revealKicker: 'Swasthi మీ జోన్‌ను తెరుస్తోంది...',
    revealText: '3 - 2 - 1',
    yourZone: 'మీ జోన్',
    lowRisk: 'తక్కువ ప్రమాదం',
    mediumRisk: 'మధ్యస్థ ప్రమాదం',
    highRisk: 'అధిక ప్రమాదం',
    confidence: 'మోడల్ విశ్వాసం',
    homeRemedies: 'ఇంటి చిట్కాలు',
    module4Route: 'మాడ్యూల్ 4 మార్గం',
    openRoute: 'మార్గం తెరవండి',
    distanceUnavailable: 'దూరం అందుబాటులో లేదు',
    awayFromTestOrigin: 'కిమీ టెస్ట్ స్థానం నుండి దూరం',
    geospatialTitle: 'భూస్థానిక విశ్లేషణ',
    nearestPhc: 'సమీప ప్రాథమిక ఆరోగ్య కేంద్రం',
    routeDetails: 'మార్గ వివరాలు',
    backToCv: 'కంప్యూటర్ విజన్‌కు తిరిగి',
    resultSummary: (risk, imageCount) => `మీ చాట్ మరియు ${imageCount} చిత్రాల ఆధారంగా మీ ప్రస్తుత జోన్ ${risk}.`,
  },
  marathi: {
    computerVisionTitle: 'कंप्यूटर व्हिजन तपासणी',
    takeImage: 'फोटो घ्या',
    choose: 'निवडा',
    imageHint: 'जलद अपलोड आणि स्पष्ट विश्लेषणासाठी फोटो 768 px रुंद केला जातो.',
    imageTitle: 'फोटोचे शीर्षक',
    sayTitle: 'शीर्षक बोला',
    mute: 'म्यूट',
    retakeTitle: 'शीर्षक पुन्हा बोला',
    submitImage: 'फोटो जमा करा',
    submittedImages: 'जमा केलेले फोटो',
    deleteImage: 'हटवा',
    finalSubmit: 'अंतिम जमा',
    skipVision: 'कंप्यूटर व्हिजन वगळा',
    goGeospatial: 'भू-स्थानिककडे जा',
    downloadReport: 'रिपोर्ट डाउनलोड करा',
    submitting: 'जमा करत आहे...',
    addImageFirst: 'अंतिम जमा करण्यापूर्वी किमान एक फोटो जोडा.',
    addTitleFirst: 'कृपया फोटोचे शीर्षक जोडा.',
    addClearImageFirst: 'कृपया आधी स्पष्ट फोटो घ्या.',
    imageOutOfContext: 'कृपया फोटोला दिसणारे लक्षण किंवा शरीराचा भाग असे शीर्षक द्या; असंबंधित मजकूर नको.',
    revealKicker: 'Swasthi तुमचा झोन उघडत आहे...',
    revealText: '3 - 2 - 1',
    yourZone: 'तुमचा झोन',
    lowRisk: 'कमी धोका',
    mediumRisk: 'मध्यम धोका',
    highRisk: 'जास्त धोका',
    confidence: 'मॉडेल विश्वास',
    homeRemedies: 'घरगुती उपाय',
    module4Route: 'मॉड्यूल 4 मार्ग',
    openRoute: 'मार्ग उघडा',
    distanceUnavailable: 'अंतर उपलब्ध नाही',
    awayFromTestOrigin: 'किमी चाचणी स्थानापासून दूर',
    geospatialTitle: 'भू-स्थानिक विश्लेषण',
    nearestPhc: 'जवळचे प्राथमिक आरोग्य केंद्र',
    routeDetails: 'मार्ग तपशील',
    backToCv: 'कंप्यूटर व्हिजनकडे परत',
    resultSummary: (risk, imageCount) => `तुमच्या चॅट आणि ${imageCount} फोटोच्या आधारे तुमचा सध्याचा झोन ${risk} आहे.`,
  },
};

export function riskLabel(risk: 'Low' | 'Medium' | 'High', copy: ModuleCopy) {
  if (risk === 'High') {
    return copy.highRisk;
  }
  if (risk === 'Medium') {
    return copy.mediumRisk;
  }
  return copy.lowRisk;
}

const remedyTranslations: Partial<Record<LanguageId, Record<string, string>>> = {
  hindi: {
    'Drink fluids often': 'बार-बार तरल पदार्थ पिएं',
    rest: 'आराम करें',
    'use light clothing': 'हल्के कपड़े पहनें',
    'monitor temperature.': 'तापमान देखते रहें।',
    'Sip warm fluids': 'गर्म तरल पदार्थ धीरे-धीरे पिएं',
    'avoid smoke and dust.': 'धुएं और धूल से बचें।',
  },
  kannada: {
    'Drink fluids often': 'ದ್ರವಗಳನ್ನು ಆಗಾಗ ಕುಡಿಯಿರಿ',
    rest: 'ವಿಶ್ರಾಂತಿ ತೆಗೆದುಕೊಳ್ಳಿ',
    'use light clothing': 'ಹಗುರವಾದ ಬಟ್ಟೆ ಧರಿಸಿ',
    'monitor temperature.': 'ತಾಪಮಾನ ಗಮನಿಸಿ.',
  },
  tamil: {
    'Drink fluids often': 'அடிக்கடி திரவம் குடிக்கவும்',
    rest: 'ஓய்வு எடுக்கவும்',
    'use light clothing': 'லேசான ஆடைகள் அணியவும்',
    'monitor temperature.': 'வெப்பநிலையை கவனிக்கவும்.',
  },
  telugu: {
    'Drink fluids often': 'తరచుగా ద్రవాలు తాగండి',
    rest: 'విశ్రాంతి తీసుకోండి',
    'use light clothing': 'తేలికైన బట్టలు ధరించండి',
    'monitor temperature.': 'ఉష్ణోగ్రతను గమనించండి.',
  },
  marathi: {
    'Drink fluids often': 'वारंवार द्रव प्या',
    rest: 'विश्रांती घ्या',
    'use light clothing': 'हलके कपडे वापरा',
    'monitor temperature.': 'तापमान तपासत राहा.',
  },
};

export function localizeRemedy(remedy: string, language: LanguageId) {
  const direct = remedyTranslations[language]?.[remedy];
  if (direct) {
    return direct;
  }
  if (language === 'english') {
    return remedy;
  }
  return translateRemedyFragments(remedy, language);
}

const remedyFragmentTranslations: Partial<Record<LanguageId, Array<[RegExp, string]>>> = {
  hindi: [
    [/\bMen\b/gi, 'पुरुष'],
    [/\bWomen\b/gi, 'महिला'],
    [/\bBoth\b/gi, 'दोनों'],
    [/\bin warm milk\b/gi, 'गर्म दूध में'],
    [/\bat night\b/gi, 'रात में'],
    [/\bmassage\b/gi, 'मालिश करें'],
    [/\bwith\b/gi, 'के साथ'],
    [/\bsoaked almonds\b/gi, 'भीगे बादाम'],
    [/\bdates in ghee\b/gi, 'घी में खजूर'],
    [/\bapple dessert\b/gi, 'सेब की मिठाई'],
    [/\bfigs with honey\b/gi, 'शहद के साथ अंजीर'],
    [/\bwarm fluids\b/gi, 'गर्म तरल पदार्थ'],
    [/\bavoid\b/gi, 'बचें'],
    [/\bsmoke and dust\b/gi, 'धुएं और धूल से'],
    [/\brest\b/gi, 'आराम करें'],
    [/\bdrink fluids\b/gi, 'तरल पदार्थ पिएं'],
  ],
  kannada: [
    [/\bMen\b/gi, 'ಪುರುಷರು'],
    [/\bWomen\b/gi, 'ಮಹಿಳೆಯರು'],
    [/\bBoth\b/gi, 'ಇಬ್ಬರೂ'],
    [/\bin warm milk\b/gi, 'ಬೆಚ್ಚಗಿನ ಹಾಲಿನಲ್ಲಿ'],
    [/\bat night\b/gi, 'ರಾತ್ರಿ'],
    [/\bmassage\b/gi, 'ಮಸಾಜ್ ಮಾಡಿ'],
    [/\bwith\b/gi, 'ಜೊತೆಗೆ'],
    [/\brest\b/gi, 'ವಿಶ್ರಾಂತಿ ತೆಗೆದುಕೊಳ್ಳಿ'],
    [/\bdrink fluids\b/gi, 'ದ್ರವಗಳನ್ನು ಕುಡಿಯಿರಿ'],
  ],
  tamil: [
    [/\bMen\b/gi, 'ஆண்கள்'],
    [/\bWomen\b/gi, 'பெண்கள்'],
    [/\bBoth\b/gi, 'இருவரும்'],
    [/\bin warm milk\b/gi, 'சூடான பாலில்'],
    [/\bat night\b/gi, 'இரவில்'],
    [/\bmassage\b/gi, 'மசாஜ் செய்யவும்'],
    [/\bwith\b/gi, 'உடன்'],
    [/\brest\b/gi, 'ஓய்வு எடுக்கவும்'],
    [/\bdrink fluids\b/gi, 'திரவம் குடிக்கவும்'],
  ],
  telugu: [
    [/\bMen\b/gi, 'పురుషులు'],
    [/\bWomen\b/gi, 'మహిళలు'],
    [/\bBoth\b/gi, 'ఇద్దరూ'],
    [/\bin warm milk\b/gi, 'వెచ్చని పాలలో'],
    [/\bat night\b/gi, 'రాత్రి'],
    [/\bmassage\b/gi, 'మసాజ్ చేయండి'],
    [/\bwith\b/gi, 'తో'],
    [/\brest\b/gi, 'విశ్రాంతి తీసుకోండి'],
    [/\bdrink fluids\b/gi, 'ద్రవాలు తాగండి'],
  ],
  marathi: [
    [/\bMen\b/gi, 'पुरुष'],
    [/\bWomen\b/gi, 'महिला'],
    [/\bBoth\b/gi, 'दोन्ही'],
    [/\bin warm milk\b/gi, 'गरम दुधात'],
    [/\bat night\b/gi, 'रात्री'],
    [/\bmassage\b/gi, 'मालिश करा'],
    [/\bwith\b/gi, 'सोबत'],
    [/\brest\b/gi, 'विश्रांती घ्या'],
    [/\bdrink fluids\b/gi, 'द्रव प्या'],
  ],
};

function translateRemedyFragments(remedy: string, language: LanguageId) {
  let translated = remedy;
  for (const [pattern, replacement] of remedyFragmentTranslations[language] ?? []) {
    translated = translated.replace(pattern, replacement);
  }
  return translated;
}
