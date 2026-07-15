import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrivacyNotice } from '@/components/privacy-notice';
import { getPhcRoute } from '@/services/swasthi-api';
import { LanguageId, languages, useLanguage } from '@/state/language-context';
import { speakInSelectedLanguage, stopSpeaking } from '@/utils/speech';


type Copy = {
  logoSubtext: string;
  welcome: string;
  headline: string;
  subtitle: string;
  chooseLanguage: string;
  voice: string;
  stop: string;
  emergency: string;
  locatePhc: string;
  unwell: string;
  findingPhc: string;
};

const copyByLanguage: Record<LanguageId, Copy> = {
  english: {
    logoSubtext: 'AI for Rural Health',
    welcome: 'WELCOME TO',
    headline: 'Your health,\nguided.',
    subtitle: 'AI-powered care for every village,\nin your language.',
    chooseLanguage: 'CHOOSE YOUR LANGUAGE',
    voice: 'HEAR SCREEN',
    stop: 'STOP',
    emergency: 'EMERGENCY',
    locatePhc: 'LOCATE NEAREST PHC',
    unwell: 'I am feeling unwell',
    findingPhc: 'Finding nearest Primary Health Centre...',
  },
  hindi: {
    logoSubtext: 'ग्रामीण स्वास्थ्य के लिए AI',
    welcome: 'स्वागत है',
    headline: 'आपका स्वास्थ्य,\nमार्गदर्शन के साथ.',
    subtitle: 'हर गांव के लिए AI-संचालित देखभाल,\nआपकी भाषा में.',
    chooseLanguage: 'अपनी भाषा चुनें',
    voice: 'स्क्रीन सुनें',
    stop: 'रोकें',
    emergency: 'आपातकाल',
    locatePhc: 'नज़दीकी PHC खोजें',
    unwell: 'मैं अस्वस्थ महसूस कर रहा/रही हूं',
    findingPhc: 'नज़दीकी प्राथमिक स्वास्थ्य केंद्र खोज रहा है...',
  },
  kannada: {
    logoSubtext: 'ಗ್ರಾಮೀಣ ಆರೋಗ್ಯಕ್ಕೆ AI',
    welcome: 'ಸ್ವಾಗತ',
    headline: 'ನಿಮ್ಮ ಆರೋಗ್ಯ,\nಮಾರ್ಗದರ್ಶನದೊಂದಿಗೆ.',
    subtitle: 'ಪ್ರತಿ ಗ್ರಾಮಕ್ಕೂ AI ಆಧಾರಿತ ಆರೈಕೆ,\nನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ.',
    chooseLanguage: 'ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ',
    voice: 'ಪರದೆ ಕೇಳಿ',
    stop: 'ನಿಲ್ಲಿಸಿ',
    emergency: 'ತುರ್ತು',
    locatePhc: 'ಹತ್ತಿರದ PHC ಹುಡುಕಿ',
    unwell: 'ನನಗೆ ಆರೋಗ್ಯ ಸರಿಯಿಲ್ಲ',
    findingPhc: 'ಹತ್ತಿರದ ಪ್ರಾಥಮಿಕ ಆರೋಗ್ಯ ಕೇಂದ್ರ ಹುಡುಕುತ್ತಿದೆ...',
  },
  tamil: {
    logoSubtext: 'கிராம சுகாதாரத்திற்கான AI',
    welcome: 'வரவேற்கிறோம்',
    headline: 'உங்கள் ஆரோக்கியம்,\nவழிகாட்டலுடன்.',
    subtitle: 'ஒவ்வொரு கிராமத்திற்கும் AI பராமரிப்பு,\nஉங்கள் மொழியில்.',
    chooseLanguage: 'உங்கள் மொழியை தேர்வு செய்யுங்கள்',
    voice: 'திரையை கேட்க',
    stop: 'நிறுத்து',
    emergency: 'அவசரம்',
    locatePhc: 'அருகிலுள்ள PHC',
    unwell: 'எனக்கு உடல்நலம் சரியில்லை',
    findingPhc: 'அருகிலுள்ள முதன்மை சுகாதார மையம் தேடப்படுகிறது...',
  },
  telugu: {
    logoSubtext: 'గ్రామీణ ఆరోగ్యానికి AI',
    welcome: 'స్వాగతం',
    headline: 'మీ ఆరోగ్యం,\nమార్గదర్శకంతో.',
    subtitle: 'ప్రతి గ్రామానికి AI ఆధారిత సంరక్షణ,\nమీ భాషలో.',
    chooseLanguage: 'మీ భాషను ఎంచుకోండి',
    voice: 'స్క్రీన్ వినండి',
    stop: 'ఆపు',
    emergency: 'అత్యవసరం',
    locatePhc: 'సమీప PHC',
    unwell: 'నాకు ఆరోగ్యం బాగోలేదు',
    findingPhc: 'సమీప ప్రాథమిక ఆరోగ్య కేంద్రం వెతుకుతోంది...',
  },
  marathi: {
    logoSubtext: 'ग्रामीण आरोग्यासाठी AI',
    welcome: 'स्वागत आहे',
    headline: 'तुमचे आरोग्य,\nमार्गदर्शनासह.',
    subtitle: 'प्रत्येक गावासाठी AI आधारित काळजी,\nतुमच्या भाषेत.',
    chooseLanguage: 'तुमची भाषा निवडा',
    voice: 'स्क्रीन ऐका',
    stop: 'थांबवा',
    emergency: 'आपत्कालीन',
    locatePhc: 'जवळचे PHC शोधा',
    unwell: 'मला बरे वाटत नाही',
    findingPhc: 'जवळचे प्राथमिक आरोग्य केंद्र शोधत आहे...',
  },
};

const demoVillageForMaps = {
  latitude: 26.855,
  longitude: 76.018,
};

const fallbackPhcMapsUrl =
  'https://www.google.com/maps/dir/?api=1&origin=26.855,76.018&destination=26.8318,76.0488&travelmode=driving';

const brandSpeechByLanguage: Record<LanguageId, string> = {
  english: 'Swasthi AI',
  hindi: 'स्वस्थि ए आई',
  kannada: 'ಸ್ವಸ್ಥಿ ಎ ಐ',
  tamil: 'ஸ்வஸ்தி ஏ ஐ',
  telugu: 'స్వస్థి ఏ ఐ',
  marathi: 'स्वस्थी ए आय',
};

const spokenLanguageNamesByLanguage: Record<LanguageId, string[]> = {
  english: ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi'],
  hindi: ['अंग्रेज़ी', 'हिन्दी', 'कन्नड़', 'तमिल', 'तेलुगु', 'मराठी'],
  kannada: ['ಇಂಗ್ಲಿಷ್', 'ಹಿಂದಿ', 'ಕನ್ನಡ', 'ತಮಿಳು', 'ತೆಲುಗು', 'ಮರಾಠಿ'],
  tamil: ['ஆங்கிலம்', 'ஹிந்தி', 'கன்னடம்', 'தமிழ்', 'தெலுங்கு', 'மராத்தி'],
  telugu: ['ఇంగ్లీష్', 'హిందీ', 'కన్నడ', 'తమిళం', 'తెలుగు', 'మరాఠీ'],
  marathi: ['इंग्रजी', 'हिंदी', 'कन्नड', 'तमिळ', 'तेलुगू', 'मराठी'],
};

export default function HomeScreen() {
  const router = useRouter();
  const { selectedLanguage, setSelectedLanguage } = useLanguage();
  const { height, width } = useWindowDimensions();
  const copy = copyByLanguage[selectedLanguage];
  const [isFindingPhc, setIsFindingPhc] = useState(false);

  const scale = useMemo(() => {
    const heightScale = height / 820;
    const widthScale = width / 430;
    return Math.max(0.68, Math.min(1, heightScale, widthScale));
  }, [height, width]);

  const isNarrow = width < 390;
  const screenText = `${copy.welcome}. ${brandSpeechByLanguage[selectedLanguage]}. ${copy.headline.replace('\n', ' ')} ${copy.subtitle.replace(
    '\n',
    ' ',
  )} ${copy.chooseLanguage}. ${spokenLanguageNamesByLanguage[selectedLanguage].join('. ')}. ${copy.emergency}. ${copy.locatePhc}. ${copy.unwell}.`;

  function handleEmergency() {
    setIsFindingPhc(true);
    speakInSelectedLanguage(copy.findingPhc, selectedLanguage);
    setTimeout(() => {
      router.push('/geospatial-analysis');
    }, 1800);
  }

  async function handleLocateNearestPhc() {
    setIsFindingPhc(true);
    speakInSelectedLanguage(copy.findingPhc, selectedLanguage);
    try {
      const route = await getPhcRoute(demoVillageForMaps);
      await Linking.openURL(route.maps_url || fallbackPhcMapsUrl);
    } catch (error) {
      await Linking.openURL(fallbackPhcMapsUrl).catch(() => {
        Alert.alert('Could not open Google Maps.');
      });
    } finally {
      setTimeout(() => setIsFindingPhc(false), 1200);
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <View style={[styles.screen, { maxWidth: Math.min(width, 430) }]}>
        <View
          style={[
            styles.hero,
            {
              paddingHorizontal: 28 * scale,
              paddingTop: 28 * scale,
              paddingBottom: 22 * scale,
            },
          ]}>
          <View style={[styles.topGlow, { width: 112 * scale, height: 112 * scale, borderRadius: 56 * scale }]} />
          <View style={[styles.bottomGlow, { width: 104 * scale, height: 104 * scale }]} />

          <View style={[styles.brandRow, { gap: 12 * scale }]}>
            <View
              style={[
                styles.logoCircle,
                {
                  width: 84 * scale,
                  height: 84 * scale,
                  borderRadius: 42 * scale,
                },
              ]}>
              <Text style={[styles.logoLeaf, { fontSize: 21 * scale, lineHeight: 23 * scale }]}>✚</Text>
              <Text style={[styles.logoText, { fontSize: 15 * scale, lineHeight: 17 * scale }]}>swasthi</Text>
              <Text
                style={[styles.logoSubtext, { fontSize: 5.5 * scale, lineHeight: 7 * scale }]}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {copy.logoSubtext}
              </Text>
            </View>
            <Text
              style={[styles.brandTitle, { fontSize: 44 * scale, lineHeight: 50 * scale }]}
              adjustsFontSizeToFit
              numberOfLines={1}>
              Swasthi AI
            </Text>
          </View>

          <View style={[styles.heroCopy, { paddingTop: 42 * scale, gap: 16 * scale }]}>
            <Text style={[styles.eyebrow, { fontSize: 15 * scale, lineHeight: 20 * scale }]}>{copy.welcome}</Text>
            <Text
              style={[styles.headline, { fontSize: 34 * scale, lineHeight: 38 * scale }]}
              adjustsFontSizeToFit
              numberOfLines={2}>
              {copy.headline}
            </Text>
            <Text
              style={[styles.subtitle, { fontSize: 17 * scale, lineHeight: 25 * scale }]}
              adjustsFontSizeToFit
              numberOfLines={2}>
              {copy.subtitle}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.languageSection,
            {
              paddingHorizontal: 24 * scale,
              paddingTop: 22 * scale,
              paddingBottom: 18 * scale,
              gap: 14 * scale,
            },
          ]}>
          <View style={[styles.languageHeader, { gap: 10 * scale }]}>
            <Text
              style={[styles.sectionLabel, { fontSize: 13.5 * scale, lineHeight: 18 * scale }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {copy.chooseLanguage}
            </Text>
            <View style={[styles.voiceActions, { gap: 8 * scale }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => speakInSelectedLanguage(screenText, selectedLanguage)}
                style={({ pressed }) => [
                  styles.voiceButton,
                  {
                    minHeight: 42 * scale,
                    borderRadius: 16 * scale,
                    paddingHorizontal: 14 * scale,
                  },
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[styles.voiceText, { fontSize: 12.5 * scale, lineHeight: 17 * scale }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {copy.voice}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={stopSpeaking}
                style={({ pressed }) => [
                  styles.stopButton,
                  {
                    minHeight: 42 * scale,
                    borderRadius: 16 * scale,
                    paddingHorizontal: 14 * scale,
                  },
                  pressed && styles.pressed,
                ]}>
                <Text
                  style={[styles.stopText, { fontSize: 12.5 * scale, lineHeight: 17 * scale }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {copy.stop}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.languageGrid, { gap: 10 * scale }]}>
            {languages.map((language) => {
              const selected = selectedLanguage === language.id;

              return (
                <Pressable
                  key={language.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedLanguage(language.id)}
                  style={({ pressed }) => [
                    styles.languageCard,
                    {
                      minHeight: 74 * scale,
                      paddingHorizontal: 16 * scale,
                      paddingVertical: 13 * scale,
                      borderRadius: 16 * scale,
                    },
                    selected && styles.languageCardSelected,
                    pressed && styles.languageCardPressed,
                  ]}>
                  <View style={styles.languageTextGroup}>
                    <Text
                      style={[styles.languageNative, { fontSize: (isNarrow ? 18 : 20) * scale, lineHeight: 25 * scale }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit>
                      {language.nativeName}
                    </Text>
                    <Text style={[styles.languageEnglish, { fontSize: 12.5 * scale, lineHeight: 16 * scale }]}>
                      {language.englishName}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      {
                        width: 23 * scale,
                        height: 23 * scale,
                        borderRadius: 12 * scale,
                      },
                      selected && styles.radioSelected,
                    ]}>
                    {selected && <Text style={[styles.checkMark, { fontSize: 19 * scale, lineHeight: 21 * scale }]}>✓</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <PrivacyNotice />

          <View style={[styles.actionRow, { gap: 12 * scale }]}>
            <Pressable
              accessibilityRole="button"
              onPress={handleEmergency}
              style={({ pressed }) => [
                styles.actionButton,
                styles.emergencyButton,
                { minHeight: 74 * scale, borderRadius: 25 * scale },
                pressed && styles.pressed,
              ]}>
              <Text
                style={[styles.actionText, { fontSize: (isNarrow ? 16 : 18) * scale, lineHeight: 23 * scale }]}
                numberOfLines={2}
                adjustsFontSizeToFit>
                {copy.emergency}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/conversation')}
              style={({ pressed }) => [
                styles.actionButton,
                styles.unwellButton,
                { minHeight: 74 * scale, borderRadius: 25 * scale },
                pressed && styles.pressed,
              ]}>
              <Text
                style={[styles.actionText, { fontSize: (isNarrow ? 15 : 17) * scale, lineHeight: 22 * scale }]}
                numberOfLines={2}
                adjustsFontSizeToFit>
                {copy.unwell}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleLocateNearestPhc}
            style={({ pressed }) => [
              styles.locateWideButton,
              { minHeight: 54 * scale, borderRadius: 20 * scale },
              pressed && styles.pressed,
            ]}>
            <Text
              style={[styles.locateActionText, { fontSize: (isNarrow ? 14.5 : 16) * scale, lineHeight: 21 * scale }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {copy.locatePhc}
            </Text>
          </Pressable>
        </View>
        {isFindingPhc ? (
          <View style={styles.emergencyOverlay}>
            <Text style={styles.emergencyOverlayText}>{copy.findingPhc}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const colors = {
  ink: '#17281B',
  green: '#3A683D',
  deepGreen: '#17331C',
  mutedGreen: '#6E8A6E',
  paleGreen: '#D7E8D3',
  selectedGreen: '#DCEED8',
  background: '#F6FAF5',
  white: '#FFFFFF',
  red: '#FF2929',
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  screen: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
  },
  hero: {
    flex: 0.43,
    backgroundColor: colors.green,
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    right: -22,
    top: -22,
    backgroundColor: 'rgba(135, 178, 121, 0.28)',
  },
  bottomGlow: {
    position: 'absolute',
    right: 24,
    bottom: 0,
    borderTopLeftRadius: 70,
    borderTopRightRadius: 70,
    backgroundColor: 'rgba(150, 192, 135, 0.56)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCircle: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: '#008A52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLeaf: {
    color: '#56AD39',
    fontWeight: '800',
  },
  logoText: {
    color: '#165F38',
    fontWeight: '800',
    letterSpacing: 0,
  },
  logoSubtext: {
    maxWidth: '84%',
    color: '#165F38',
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
  },
  brandTitle: {
    flex: 1,
    color: colors.white,
    fontFamily: 'serif',
    fontWeight: '800',
    letterSpacing: 0,
  },
  heroCopy: {
    flexShrink: 1,
  },
  eyebrow: {
    color: '#AFC6AF',
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  headline: {
    color: colors.white,
    fontFamily: 'serif',
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#B8CDB7',
    fontWeight: '800',
    letterSpacing: 0,
  },
  languageSection: {
    flex: 0.57,
    justifyContent: 'space-between',
  },
  sectionLabel: {
    flex: 1,
    minWidth: 150,
    color: colors.mutedGreen,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  languageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceActions: {
    flexDirection: 'row',
    flexShrink: 0,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  voiceButton: {
    justifyContent: 'center',
    backgroundColor: colors.deepGreen,
  },
  stopButton: {
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.deepGreen,
    backgroundColor: colors.white,
  },
  voiceText: {
    color: colors.white,
    fontWeight: '900',
    letterSpacing: 0,
  },
  stopText: {
    color: colors.deepGreen,
    fontWeight: '900',
    letterSpacing: 0,
  },
  languageCard: {
    width: '48.5%',
    flexGrow: 1,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: colors.paleGreen,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  languageCardSelected: {
    borderColor: colors.green,
    backgroundColor: colors.selectedGreen,
  },
  languageCardPressed: {
    opacity: 0.86,
  },
  languageTextGroup: {
    flexShrink: 1,
    gap: 4,
  },
  languageNative: {
    color: colors.ink,
    fontWeight: '900',
    letterSpacing: 0,
  },
  languageEnglish: {
    color: colors.mutedGreen,
    fontWeight: '500',
    letterSpacing: 0,
  },
  radio: {
    flexShrink: 0,
    borderWidth: 2,
    borderColor: colors.paleGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  checkMark: {
    color: colors.white,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  emergencyButton: {
    backgroundColor: colors.red,
  },
  locateButton: {
    backgroundColor: colors.deepGreen,
  },
  locateWideButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: colors.deepGreen,
  },
  unwellButton: {
    backgroundColor: '#467A46',
  },
  pressed: {
    opacity: 0.82,
  },
  actionText: {
    color: colors.white,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0,
  },
  locateActionText: {
    color: colors.white,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0,
  },
  emergencyOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 26,
    minHeight: 82,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: colors.deepGreen,
  },
  emergencyOverlayText: {
    color: colors.white,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
});
