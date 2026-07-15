import { useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { PrivacyNotice } from '@/components/privacy-notice';
import { ChatMessagePayload, FinalAssessmentResponse, submitFinalAssessment, transcribeVoice } from '@/services/swasthi-api';
import { localizeRemedy, moduleCopyByLanguage, riskLabel } from '@/constants/module-copy';
import { LanguageId, useLanguage } from '@/state/language-context';
import { speakInSelectedLanguage } from '@/utils/speech';
import { createWebSpeechRecognition, isWebSpeechSupported } from '@/utils/web-speech';

type SubmittedImage = {
  uri: string;
  title: string;
};

type PatientProfile = {
  name?: string;
  sex?: string;
  age?: string;
};

const imageContextTerms = [
  'rash', 'skin', 'itch', 'swelling', 'red', 'redness', 'wound', 'cut', 'burn', 'bruise', 'eye', 'mouth', 'throat',
  'tongue', 'hand', 'arm', 'leg', 'foot', 'toe', 'finger', 'face', 'neck', 'chest', 'back', 'stomach', 'abdomen',
  'knee', 'ankle', 'elbow', 'shoulder', 'pain', 'pus', 'bleeding', 'mole', 'acne', 'pimple', 'lesion', 'infection',
  'लाल', 'त्वचा', 'घाव', 'सूजन', 'आंख', 'गला', 'चेहरा', 'हाथ', 'पैर', 'दर्द',
];

const nonHealthImageTerms = [
  'food', 'car', 'house', 'tree', 'dog', 'cat', 'homework', 'selfie', 'landscape', 'screen', 'laptop', 'book',
  'match', 'game', 'movie', 'song',
];

export default function ComputerVisionScreen() {
  const router = useRouter();
  const { prompt, chat, patient } = useLocalSearchParams<{ prompt?: string; chat?: string; patient?: string }>();
  const { width } = useWindowDimensions();
  const { selectedLanguage, selectedLanguageName } = useLanguage();
  const copy = moduleCopyByLanguage[selectedLanguage];
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webTitleRecognition = useRef<ReturnType<typeof createWebSpeechRecognition> | null>(null);
  const webTitleTranscript = useRef('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [submitted, setSubmitted] = useState<SubmittedImage[]>([]);
  const [isTitleVoiceLoading, setIsTitleVoiceLoading] = useState(false);
  const [isWebTitleListening, setIsWebTitleListening] = useState(false);
  const [titleFromVoice, setTitleFromVoice] = useState(false);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [cvWarning, setCvWarning] = useState('');
  const [finalAssessment, setFinalAssessment] = useState<FinalAssessmentResponse | null>(null);
  const patientProfile = parsePatientProfile(patient);

  useEffect(() => {
    (async () => {
      await ImagePicker.requestCameraPermissionsAsync();
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert('Microphone permission is needed to say an image title.');
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    })();

    return () => {
      clearAutoStopTimer();
      clearWarningTimer();
      webTitleRecognition.current?.abort();
    };
  }, []);

  function clearAutoStopTimer() {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
  }

  function clearWarningTimer() {
    if (warningTimer.current) {
      clearTimeout(warningTimer.current);
      warningTimer.current = null;
    }
  }

  function showCvWarning(message: string) {
    setCvWarning(message);
    speakInSelectedLanguage(message, selectedLanguage);
    clearWarningTimer();
    warningTimer.current = setTimeout(() => {
      setCvWarning('');
      warningTimer.current = null;
    }, 4200);
  }

  async function resizeImage(uri: string) {
    const resized = await manipulateAsync(
      uri,
      [{ resize: { width: 768 } }],
      { compress: 0.82, format: SaveFormat.JPEG },
    );
    return resized.uri;
  }

  async function takePhoto() {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    });
    if (!result.canceled) {
      setImageUri(await resizeImage(result.assets[0].uri));
    }
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    });
    if (!result.canceled) {
      setImageUri(await resizeImage(result.assets[0].uri));
    }
  }

  async function finishTitleRecording() {
    try {
      clearAutoStopTimer();
      setIsTitleVoiceLoading(true);
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) {
        throw new Error('Recording was empty. Please try again.');
      }
      const response = await transcribeVoice({ language: selectedLanguageName, uri });
      if (!response.text.trim()) {
        throw new Error(copy.addTitleFirst);
      }
      setTitle(response.text.trim());
      setTitleFromVoice(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice title failed.';
      Alert.alert(message);
    } finally {
      setIsTitleVoiceLoading(false);
    }
  }

  function finishWebTitleRecording() {
    clearAutoStopTimer();
    webTitleRecognition.current?.stop();
    webTitleRecognition.current = null;
    setIsWebTitleListening(false);
    const transcript = webTitleTranscript.current.trim();
    webTitleTranscript.current = '';
    if (transcript) {
      setTitle(transcript);
      setTitleFromVoice(true);
    }
  }

  async function handleTitleVoice() {
    if (isTitleVoiceLoading) {
      return;
    }
    if (Platform.OS === 'web' && isWebSpeechSupported()) {
      if (isWebTitleListening) {
        finishWebTitleRecording();
        return;
      }
      webTitleTranscript.current = '';
      const recognition = createWebSpeechRecognition({
        language: selectedLanguage,
        onText: (text) => {
          webTitleTranscript.current = text;
          setTitle(text);
          setTitleFromVoice(true);
        },
        onError: (message) => {
          Alert.alert(message);
          setIsWebTitleListening(false);
        },
      });
      if (!recognition) {
        Alert.alert(copy.addTitleFirst);
        return;
      }
      webTitleRecognition.current = recognition;
      recognition.start();
      setIsWebTitleListening(true);
      clearAutoStopTimer();
      autoStopTimer.current = setTimeout(finishWebTitleRecording, 10000);
      return;
    }
    if (recorderState.isRecording) {
      await finishTitleRecording();
      return;
    }
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      clearAutoStopTimer();
      autoStopTimer.current = setTimeout(() => {
        finishTitleRecording();
      }, 8000);
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.addTitleFirst;
      Alert.alert(message);
    }
  }

  async function retakeTitleVoice() {
    setTitle('');
    setTitleFromVoice(false);
    webTitleTranscript.current = '';
    if (isWebTitleListening || recorderState.isRecording) {
      return;
    }
    await handleTitleVoice();
  }

  function submitImage() {
    if (!imageUri) {
      Alert.alert(copy.addClearImageFirst);
      return;
    }
    if (!title.trim()) {
      showCvWarning(copy.addTitleFirst);
      return;
    }
    if (!isRelevantImageTitle(title)) {
      showCvWarning(copy.imageOutOfContext);
      return;
    }
    setSubmitted((current) => [{
      uri: imageUri,
      title: title.trim(),
    }, ...current]);
    setTitle('');
    setTitleFromVoice(false);
    setImageUri(null);
  }

  function deleteSubmittedImage(indexToDelete: number) {
    setSubmitted((current) => current.filter((_, index) => index !== indexToDelete));
  }

  function clearCurrentImage() {
    setImageUri(null);
    setTitle('');
    setTitleFromVoice(false);
  }

  function parseChatMessages(): ChatMessagePayload[] {
    if (!chat) {
      return [];
    }
    return String(chat)
      .split('\n')
      .map((line) => {
        const separator = line.indexOf(':');
        const role = line.slice(0, separator);
        const content = line.slice(separator + 1).trim();
        if ((role === 'user' || role === 'assistant') && content) {
          return { role, content };
        }
        return null;
      })
      .filter((item): item is ChatMessagePayload => item !== null);
  }

  async function submitFinal() {
    let imagesToSubmit = submitted;
    if (imageUri && title.trim()) {
      if (!isRelevantImageTitle(title)) {
        showCvWarning(copy.imageOutOfContext);
        return;
      }
      imagesToSubmit = [{ uri: imageUri, title: title.trim() }, ...submitted];
      setSubmitted(imagesToSubmit);
      setImageUri(null);
      setTitle('');
      setTitleFromVoice(false);
    } else if (imageUri) {
      showCvWarning(copy.addTitleFirst);
      return;
    }
    setIsFinalSubmitting(true);
    setFinalAssessment(null);
    try {
      const response = await submitFinalAssessment({
        messages: parseChatMessages(),
        images: imagesToSubmit.length > 0
          ? imagesToSubmit.map((item) => ({ title: item.title }))
          : [{ title: 'No visible symptom image submitted' }],
        language: selectedLanguageName,
      });
      setIsRevealing(true);
      setTimeout(() => {
        setFinalAssessment(response);
        setIsRevealing(false);
      }, 1400);
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.addImageFirst;
      Alert.alert(message);
    } finally {
      setIsFinalSubmitting(false);
    }
  }

  function isRelevantImageTitle(value: string) {
    const normalized = value.toLowerCase();
    if (nonHealthImageTerms.some((term) => normalized.includes(term))) {
      return false;
    }
    return imageContextTerms.some((term) => normalized.includes(term.toLowerCase()));
  }

  function goToGeospatial() {
    if (finalAssessment?.route) {
      router.push({
        pathname: '/geospatial-analysis',
        params: {
          route: JSON.stringify(finalAssessment.route),
          confidence: String(finalAssessment.confidence),
          patient: JSON.stringify(patientProfile),
        },
      });
      return;
    }
    router.push('/geospatial-analysis');
  }

  async function downloadReport() {
    if (!finalAssessment) {
      return;
    }
    const reportImages = await Promise.all(
      submitted.map(async (item) => ({
        title: item.title,
        dataUri: await imageUriToDataUri(item.uri).catch(() => item.uri),
      })),
    );
    const html = buildReportHtml({
      patientProfile,
      messages: parseChatMessages(),
      images: reportImages,
      assessment: finalAssessment,
      language: selectedLanguage,
    });
    const filename = `swasthi-report-${Date.now()}.html`;
    if (Platform.OS === 'web') {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      return;
    }
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await Linking.openURL(dataUrl);
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={[styles.screen, { maxWidth: Math.min(width, 430) }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/conversation')} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{copy.computerVisionTitle}</Text>
      </View>

      {cvWarning ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>{cvWarning}</Text>
        </View>
      ) : null}

      <View style={styles.preview}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        ) : (
          <Text style={styles.previewText}>
            {prompt || copy.addClearImageFirst}
          </Text>
        )}
      </View>

      {prompt && <Text style={styles.photoPrompt}>{prompt}</Text>}

      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" onPress={takePhoto} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{copy.takeImage}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={choosePhoto} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{copy.choose}</Text>
        </Pressable>
      </View>

      <Text style={styles.pixelHint}>{copy.imageHint}</Text>

      <View style={styles.titleBox}>
        <TextInput
          value={title}
          onChangeText={(text) => {
            setTitle(text);
            setTitleFromVoice(false);
          }}
          placeholder={copy.imageTitle}
          placeholderTextColor="#7A8B78"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          onPress={handleTitleVoice}
          disabled={isTitleVoiceLoading}
          style={({ pressed }) => [
            styles.voiceButton,
            (recorderState.isRecording || isWebTitleListening) && styles.voiceButtonRecording,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.voiceText}>
            {isTitleVoiceLoading ? '...' : recorderState.isRecording || isWebTitleListening ? copy.mute : copy.sayTitle}
          </Text>
        </Pressable>
        {titleFromVoice && title.trim().length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={retakeTitleVoice}
            style={({ pressed }) => [styles.retakeTitleButton, pressed && styles.pressed]}>
            <Text style={styles.retakeTitleText}>{copy.retakeTitle}</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={submitImage} style={({ pressed }) => [styles.submitButton, pressed && styles.pressed]}>
        <Text style={styles.submitText}>{copy.submitImage}</Text>
      </Pressable>

      {imageUri ? (
        <Pressable accessibilityRole="button" onPress={clearCurrentImage} style={({ pressed }) => [styles.clearImageButton, pressed && styles.pressed]}>
          <Text style={styles.clearImageText}>{copy.deleteImage}</Text>
        </Pressable>
      ) : null}

      {submitted.length > 0 && (
        <View style={styles.submittedPanel}>
          <Text style={styles.submittedLabel}>{copy.submittedImages}</Text>
          {submitted.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.submittedItem}>
              <View style={styles.submittedHeader}>
                <Text style={styles.submittedTitle}>{item.title}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => deleteSubmittedImage(index)}
                  style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  <Text style={styles.deleteText}>{copy.deleteImage}</Text>
                </Pressable>
              </View>
              <Image source={{ uri: item.uri }} style={styles.submittedImage} resizeMode="contain" />
            </View>
          ))}
        </View>
      )}

      <View style={styles.secondaryActionRow}>
        <Pressable
          accessibilityRole="button"
          onPress={submitFinal}
          disabled={isFinalSubmitting}
          style={({ pressed }) => [styles.skipButton, isFinalSubmitting && styles.disabledButton, pressed && styles.pressed]}>
          <Text style={styles.skipText}>{copy.skipVision}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={goToGeospatial}
          style={({ pressed }) => [styles.geoButton, pressed && styles.pressed]}>
          <Text style={styles.geoText}>{copy.goGeospatial}</Text>
        </Pressable>
      </View>

      <PrivacyNotice />

      <Pressable
        accessibilityRole="button"
        onPress={submitFinal}
        disabled={isFinalSubmitting}
        style={({ pressed }) => [
          styles.finalButton,
          isFinalSubmitting && styles.disabledButton,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.finalText}>{isFinalSubmitting ? copy.submitting : copy.finalSubmit}</Text>
      </Pressable>

      {isRevealing && (
        <View style={styles.revealPanel}>
          <Text style={styles.revealKicker}>{copy.revealKicker}</Text>
          <Text style={styles.revealText}>{copy.revealText}</Text>
        </View>
      )}

      {finalAssessment && (
        <View style={[styles.resultPanel, finalAssessment.risk === 'High' ? styles.highPanel : finalAssessment.risk === 'Medium' ? styles.mediumPanel : styles.lowPanel]}>
          <Text style={styles.resultKicker}>{copy.yourZone}</Text>
          <Text style={styles.resultRisk}>{riskLabel(finalAssessment.risk, copy)}</Text>
          <Text style={styles.resultSummary}>{copy.resultSummary(riskLabel(finalAssessment.risk, copy), submitted.length)}</Text>
          <Text style={styles.confidenceText}>{copy.confidence}: {Math.round(finalAssessment.confidence * 100)}%</Text>
          {finalAssessment.remedies.length > 0 && (
            <View style={styles.remedyList}>
              <Text style={styles.resultKicker}>{copy.homeRemedies}</Text>
              {finalAssessment.remedies.map((remedy) => (
                <Text key={remedy} style={styles.remedyText}>- {localizeRemedy(remedy, selectedLanguage)}</Text>
              ))}
            </View>
          )}
          {finalAssessment.route && (
            <View style={styles.remedyList}>
              <Text style={styles.resultKicker}>{copy.module4Route}</Text>
              <Text style={styles.remedyText}>{finalAssessment.route.name}</Text>
              <Text style={styles.remedyText}>{finalAssessment.route.address}</Text>
              <Text style={styles.remedyText}>
                {finalAssessment.route.distance_km == null ? copy.distanceUnavailable : `${finalAssessment.route.distance_km} ${copy.awayFromTestOrigin}`}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={goToGeospatial}
                style={({ pressed }) => [styles.geoButton, pressed && styles.pressed]}>
                <Text style={styles.geoText}>{copy.goGeospatial}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => Linking.openURL(finalAssessment.route?.maps_url ?? '')}
                style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}>
                <Text style={styles.mapText}>{copy.openRoute}</Text>
              </Pressable>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={downloadReport}
            style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}>
            <Text style={styles.reportText}>{copy.downloadReport}</Text>
          </Pressable>
        </View>
      )}
      </View>
    </ScrollView>
  );
}

function parsePatientProfile(value?: string): PatientProfile {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(String(value)) as PatientProfile;
  } catch {
    return {};
  }
}

async function imageUriToDataUri(uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onloadend = () => resolve(String(reader.result ?? uri));
    reader.readAsDataURL(blob);
  });
}

function buildReportHtml({
  patientProfile,
  messages,
  images,
  assessment,
  language,
}: {
  patientProfile: PatientProfile;
  messages: ChatMessagePayload[];
  images: { title: string; dataUri: string }[];
  assessment: FinalAssessmentResponse;
  language: LanguageId;
}) {
  const reportCopy = reportCopyByLanguage[language];
  const copy = moduleCopyByLanguage[language];
  const rows = [
    [reportCopy.name, patientProfile.name ?? '-'],
    [reportCopy.sex, patientProfile.sex ? localizeReportSex(patientProfile.sex, language) : '-'],
    [reportCopy.age, patientProfile.age ?? '-'],
    [reportCopy.riskZone, riskLabel(assessment.risk, copy)],
    [reportCopy.confidence, `${Math.round(assessment.confidence * 100)}%`],
  ];
  const matches = assessment.possible_matches.length > 0
    ? assessment.possible_matches
    : [];
  const localizedRemedies = assessment.remedies.map((remedy) => localizeRemedy(remedy, language));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reportCopy.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #17281B; margin: 32px; line-height: 1.45; }
    h1, h2 { color: #17331C; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    td, th { border: 1px solid #C9DCC4; padding: 8px; text-align: left; vertical-align: top; }
    .pill { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #DCEED8; font-weight: 700; }
    .image { max-width: 320px; max-height: 280px; border: 1px solid #C9DCC4; border-radius: 8px; display: block; margin-top: 8px; }
    .note { color: #6E8A6E; font-size: 13px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(reportCopy.title)}</h1>
  <p class="note">${escapeHtml(reportCopy.note)}</p>
  <h2>${escapeHtml(reportCopy.patientInformation)}</h2>
  <table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
  <h2>${escapeHtml(reportCopy.exactSymptoms)}</h2>
  <p>${assessment.structured_symptoms.length ? assessment.structured_symptoms.map(escapeHtml).join(', ') : escapeHtml(reportCopy.noSymptoms)}</p>
  <h2>${escapeHtml(reportCopy.possiblePatterns)}</h2>
  ${matches.length ? `<table><tr><th>${escapeHtml(reportCopy.pattern)}</th><th>${escapeHtml(reportCopy.confidence)}</th><th>${escapeHtml(reportCopy.matchedSymptoms)}</th></tr>${matches.map((match) => `<tr><td>${escapeHtml(match.disease_group)}</td><td>${Math.round(match.confidence * 100)}%</td><td>${match.matched_symptoms.map(escapeHtml).join(', ')}</td></tr>`).join('')}</table>` : `<p>${escapeHtml(reportCopy.noPatterns)}</p>`}
  <h2>${escapeHtml(reportCopy.riskZone)}</h2>
  <p><span class="pill">${escapeHtml(riskLabel(assessment.risk, copy))}</span></p>
  <p>${escapeHtml(copy.resultSummary(riskLabel(assessment.risk, copy), images.length))}</p>
  <h2>${escapeHtml(reportCopy.remedies)}</h2>
  ${localizedRemedies.length ? `<ul>${localizedRemedies.map((remedy) => `<li>${escapeHtml(remedy)}</li>`).join('')}</ul>` : `<p>${escapeHtml(reportCopy.noRemedies)}</p>`}
  ${assessment.route ? `<h2>${escapeHtml(reportCopy.phcRoute)}</h2><p><strong>${escapeHtml(assessment.route.name)}</strong><br />${escapeHtml(assessment.route.address)}<br />${assessment.route.distance_km ?? '-'} km</p><p><a href="${escapeHtml(assessment.route.maps_url)}">${escapeHtml(copy.openRoute)}</a></p>` : ''}
  <h2>${escapeHtml(reportCopy.transcript)}</h2>
  <table><tr><th>${escapeHtml(reportCopy.role)}</th><th>${escapeHtml(reportCopy.message)}</th></tr>${messages.map((message) => `<tr><td>${escapeHtml(localizeRole(message.role, language))}</td><td>${escapeHtml(message.content)}</td></tr>`).join('')}</table>
  <h2>${escapeHtml(reportCopy.images)}</h2>
  ${images.length ? images.map((image) => `<div><strong>${escapeHtml(image.title)}</strong><img class="image" src="${image.dataUri}" /></div>`).join('') : `<p>${escapeHtml(reportCopy.noImages)}</p>`}
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const reportCopyByLanguage: Record<LanguageId, {
  title: string;
  note: string;
  patientInformation: string;
  name: string;
  sex: string;
  age: string;
  riskZone: string;
  confidence: string;
  exactSymptoms: string;
  noSymptoms: string;
  possiblePatterns: string;
  pattern: string;
  matchedSymptoms: string;
  noPatterns: string;
  remedies: string;
  noRemedies: string;
  phcRoute: string;
  transcript: string;
  role: string;
  message: string;
  images: string;
  noImages: string;
}> = {
  english: {
    title: 'Swasthi Patient Report',
    note: 'This report is AI-assisted and is not a medical diagnosis.',
    patientInformation: 'Patient Information',
    name: 'Name',
    sex: 'Sex',
    age: 'Age',
    riskZone: 'Risk Zone',
    confidence: 'Confidence',
    exactSymptoms: 'Exact Symptoms Found',
    noSymptoms: 'No structured symptoms found.',
    possiblePatterns: 'Possible Disease Patterns',
    pattern: 'Pattern',
    matchedSymptoms: 'Matched symptoms',
    noPatterns: 'No possible disease patterns found.',
    remedies: 'Home Remedies / Next Step',
    noRemedies: 'No home remedies were given because this was high risk or insufficient information.',
    phcRoute: 'Nearest PHC Route',
    transcript: 'Conversation Transcript',
    role: 'Role',
    message: 'Message',
    images: 'Computer Vision Images',
    noImages: 'Computer Vision was skipped or no images were submitted.',
  },
  hindi: {
    title: 'Swasthi मरीज रिपोर्ट',
    note: 'यह रिपोर्ट AI-सहायता से बनी है और चिकित्सा निदान नहीं है।',
    patientInformation: 'मरीज की जानकारी',
    name: 'नाम',
    sex: 'लिंग',
    age: 'उम्र',
    riskZone: 'जोखिम ज़ोन',
    confidence: 'विश्वास',
    exactSymptoms: 'मिले हुए सटीक लक्षण',
    noSymptoms: 'कोई संरचित लक्षण नहीं मिला।',
    possiblePatterns: 'संभावित रोग पैटर्न',
    pattern: 'पैटर्न',
    matchedSymptoms: 'मिलते लक्षण',
    noPatterns: 'कोई संभावित रोग पैटर्न नहीं मिला।',
    remedies: 'घरेलू उपाय / अगला कदम',
    noRemedies: 'उच्च जोखिम या अपर्याप्त जानकारी के कारण घरेलू उपाय नहीं दिए गए।',
    phcRoute: 'नज़दीकी PHC मार्ग',
    transcript: 'बातचीत रिकॉर्ड',
    role: 'भूमिका',
    message: 'संदेश',
    images: 'कंप्यूटर विज़न तस्वीरें',
    noImages: 'कंप्यूटर विज़न छोड़ा गया या कोई तस्वीर जमा नहीं हुई।',
  },
  kannada: {
    title: 'Swasthi ರೋಗಿ ವರದಿ',
    note: 'ಈ ವರದಿ AI ಸಹಾಯದಿಂದ ತಯಾರಿಸಲಾಗಿದೆ ಮತ್ತು ವೈದ್ಯಕೀಯ ರೋಗನಿರ್ಣಯವಲ್ಲ.',
    patientInformation: 'ರೋಗಿಯ ಮಾಹಿತಿ',
    name: 'ಹೆಸರು',
    sex: 'ಲಿಂಗ',
    age: 'ವಯಸ್ಸು',
    riskZone: 'ಅಪಾಯ ವಲಯ',
    confidence: 'ವಿಶ್ವಾಸ',
    exactSymptoms: 'ಕಂಡುಬಂದ ನಿಖರ ಲಕ್ಷಣಗಳು',
    noSymptoms: 'ರಚನಾತ್ಮಕ ಲಕ್ಷಣಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',
    possiblePatterns: 'ಸಂಭಾವ್ಯ ರೋಗ ಮಾದರಿಗಳು',
    pattern: 'ಮಾದರಿ',
    matchedSymptoms: 'ಹೊಂದುವ ಲಕ್ಷಣಗಳು',
    noPatterns: 'ಸಂಭಾವ್ಯ ರೋಗ ಮಾದರಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ.',
    remedies: 'ಮನೆಮದ್ದುಗಳು / ಮುಂದಿನ ಹಂತ',
    noRemedies: 'ಹೆಚ್ಚಿನ ಅಪಾಯ ಅಥವಾ ಅಪೂರ್ಣ ಮಾಹಿತಿಯಿಂದ ಮನೆಮದ್ದುಗಳನ್ನು ನೀಡಲಾಗಿಲ್ಲ.',
    phcRoute: 'ಹತ್ತಿರದ PHC ಮಾರ್ಗ',
    transcript: 'ಸಂಭಾಷಣೆ ದಾಖಲೆ',
    role: 'ಪಾತ್ರ',
    message: 'ಸಂದೇಶ',
    images: 'ಕಂಪ್ಯೂಟರ್ ವಿಜನ್ ಚಿತ್ರಗಳು',
    noImages: 'ಕಂಪ್ಯೂಟರ್ ವಿಜನ್ ಬಿಡಲಾಗಿದೆ ಅಥವಾ ಚಿತ್ರಗಳನ್ನು ಸಲ್ಲಿಸಲಾಗಿಲ್ಲ.',
  },
  tamil: {
    title: 'Swasthi நோயாளர் அறிக்கை',
    note: 'இந்த அறிக்கை AI உதவியுடன் உருவாக்கப்பட்டது; இது மருத்துவ நோயறிதல் அல்ல.',
    patientInformation: 'நோயாளர் தகவல்',
    name: 'பெயர்',
    sex: 'பாலினம்',
    age: 'வயது',
    riskZone: 'ஆபத்து மண்டலம்',
    confidence: 'நம்பிக்கை',
    exactSymptoms: 'கண்டறியப்பட்ட துல்லியமான அறிகுறிகள்',
    noSymptoms: 'கட்டமைக்கப்பட்ட அறிகுறிகள் இல்லை.',
    possiblePatterns: 'சாத்தியமான நோய் வடிவங்கள்',
    pattern: 'வடிவம்',
    matchedSymptoms: 'பொருந்திய அறிகுறிகள்',
    noPatterns: 'சாத்தியமான நோய் வடிவங்கள் இல்லை.',
    remedies: 'வீட்டு வைத்தியம் / அடுத்த படி',
    noRemedies: 'அதிக ஆபத்து அல்லது போதிய தகவல் இல்லாததால் வீட்டு வைத்தியம் வழங்கப்படவில்லை.',
    phcRoute: 'அருகிலுள்ள PHC பாதை',
    transcript: 'உரையாடல் பதிவு',
    role: 'பங்கு',
    message: 'செய்தி',
    images: 'கணினி பார்வை படங்கள்',
    noImages: 'கணினி பார்வை தவிர்க்கப்பட்டது அல்லது படங்கள் சமர்ப்பிக்கப்படவில்லை.',
  },
  telugu: {
    title: 'Swasthi రోగి నివేదిక',
    note: 'ఈ నివేదిక AI సహాయంతో తయారైంది; ఇది వైద్య నిర్ధారణ కాదు.',
    patientInformation: 'రోగి సమాచారం',
    name: 'పేరు',
    sex: 'లింగం',
    age: 'వయస్సు',
    riskZone: 'ప్రమాద జోన్',
    confidence: 'నమ్మకం',
    exactSymptoms: 'కనిపించిన ఖచ్చితమైన లక్షణాలు',
    noSymptoms: 'నిర్మిత లక్షణాలు కనబడలేదు.',
    possiblePatterns: 'సంభావ్య వ్యాధి నమూనాలు',
    pattern: 'నమూనా',
    matchedSymptoms: 'సరిపోలిన లక్షణాలు',
    noPatterns: 'సంభావ్య వ్యాధి నమూనాలు కనబడలేదు.',
    remedies: 'ఇంటి చిట్కాలు / తదుపరి దశ',
    noRemedies: 'అధిక ప్రమాదం లేదా తగిన సమాచారం లేకపోవడంతో ఇంటి చిట్కాలు ఇవ్వలేదు.',
    phcRoute: 'సమీప PHC మార్గం',
    transcript: 'సంభాషణ రికార్డు',
    role: 'పాత్ర',
    message: 'సందేశం',
    images: 'కంప్యూటర్ విజన్ చిత్రాలు',
    noImages: 'కంప్యూటర్ విజన్ దాటవేయబడింది లేదా చిత్రాలు సమర్పించలేదు.',
  },
  marathi: {
    title: 'Swasthi रुग्ण रिपोर्ट',
    note: 'हा रिपोर्ट AI-सहाय्याने तयार केला आहे आणि वैद्यकीय निदान नाही.',
    patientInformation: 'रुग्ण माहिती',
    name: 'नाव',
    sex: 'लिंग',
    age: 'वय',
    riskZone: 'धोका झोन',
    confidence: 'विश्वास',
    exactSymptoms: 'आढळलेली अचूक लक्षणे',
    noSymptoms: 'रचलेली लक्षणे आढळली नाहीत.',
    possiblePatterns: 'संभाव्य आजार नमुने',
    pattern: 'नमुना',
    matchedSymptoms: 'जुळलेली लक्षणे',
    noPatterns: 'संभाव्य आजार नमुने आढळले नाहीत.',
    remedies: 'घरगुती उपाय / पुढील पाऊल',
    noRemedies: 'जास्त धोका किंवा अपुरी माहिती असल्याने घरगुती उपाय दिले नाहीत.',
    phcRoute: 'जवळचा PHC मार्ग',
    transcript: 'संभाषण नोंद',
    role: 'भूमिका',
    message: 'संदेश',
    images: 'कंप्यूटर व्हिजन फोटो',
    noImages: 'कंप्यूटर व्हिजन वगळले किंवा फोटो जमा झाले नाहीत.',
  },
};

function localizeRole(role: ChatMessagePayload['role'], language: LanguageId) {
  if (language === 'hindi') {
    return role === 'user' ? 'मरीज' : 'सहायक';
  }
  if (language === 'kannada') {
    return role === 'user' ? 'ರೋಗಿ' : 'ಸಹಾಯಕ';
  }
  if (language === 'tamil') {
    return role === 'user' ? 'நோயாளர்' : 'உதவியாளர்';
  }
  if (language === 'telugu') {
    return role === 'user' ? 'రోగి' : 'సహాయకుడు';
  }
  if (language === 'marathi') {
    return role === 'user' ? 'रुग्ण' : 'सहायक';
  }
  return role;
}

function localizeReportSex(value: string, language: LanguageId) {
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
    backgroundColor: colors.background,
  },
  reportButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    marginTop: 4,
  },
  reportText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  content: {
    alignItems: 'center',
    padding: 18,
    gap: 16,
  },
  screen: {
    width: '100%',
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  title: {
    flex: 1,
    color: colors.deepGreen,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: 0,
  },
  warningBanner: {
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1A1A1',
    backgroundColor: '#FFF0F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningText: {
    color: colors.deepGreen,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 320,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#C9DCC4',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.white,
  },
  previewText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 26,
  },
  pixelHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  photoPrompt: {
    color: colors.deepGreen,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    textAlign: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: '#EEF7EC',
    padding: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  secondaryText: {
    color: colors.deepGreen,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  titleBox: {
    gap: 10,
  },
  input: {
    minHeight: 50,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
  },
  voiceButton: {
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paleGreen,
  },
  voiceButtonRecording: {
    backgroundColor: '#F7D7D7',
  },
  voiceText: {
    color: colors.deepGreen,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  retakeTitleButton: {
    minHeight: 44,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  retakeTitleText: {
    color: colors.deepGreen,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  clearImageButton: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#B94A48',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  clearImageText: {
    color: '#9D2F2D',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deepGreen,
  },
  submitText: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  finalButton: {
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#102816',
  },
  disabledButton: {
    opacity: 0.45,
  },
  finalText: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  revealPanel: {
    minHeight: 132,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    backgroundColor: '#17331C',
  },
  revealKicker: {
    color: '#DCEED8',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  revealText: {
    color: colors.white,
    fontSize: 42,
    lineHeight: 50,
    fontWeight: '900',
  },
  geoTransitionPanel: {
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8CC7D',
    backgroundColor: '#FFF7DF',
    padding: 16,
  },
  geoTransitionText: {
    color: colors.deepGreen,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '900',
  },
  resultPanel: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  lowPanel: {
    borderColor: '#B8DDBB',
    backgroundColor: '#ECF8ED',
  },
  mediumPanel: {
    borderColor: '#E8CC7D',
    backgroundColor: '#FFF7DF',
  },
  highPanel: {
    borderColor: '#E1A1A1',
    backgroundColor: '#FFF0F0',
  },
  resultKicker: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  resultRisk: {
    color: colors.deepGreen,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  resultSummary: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  confidenceText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  remedyList: {
    gap: 7,
    paddingTop: 6,
  },
  remedyText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  mapButton: {
    minHeight: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deepGreen,
  },
  mapText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  submittedPanel: {
    gap: 12,
    paddingTop: 4,
  },
  submittedLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  submittedTitle: {
    flex: 1,
    color: colors.deepGreen,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
  },
  submittedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteButton: {
    minHeight: 34,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F0',
  },
  deleteText: {
    color: '#9D2F2D',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skipButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 10,
  },
  skipText: {
    color: colors.deepGreen,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  geoButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paleGreen,
    paddingHorizontal: 10,
  },
  geoText: {
    color: colors.deepGreen,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  submittedItem: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    padding: 10,
  },
  submittedImage: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 320,
    borderRadius: 16,
    backgroundColor: colors.white,
  },
  pressed: {
    opacity: 0.82,
  },
});
