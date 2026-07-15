import { useState } from 'react';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { PrivacyNotice } from '@/components/privacy-notice';
import { analyzePrescription, PrescriptionAnalyzeResponse } from '@/services/swasthi-api';

type PatientProfile = {
  name?: string;
  sex?: string;
  age?: string;
};

export default function PrescriptionManagementScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { patient } = useLocalSearchParams<{ patient?: string }>();
  const patientProfile = parsePatientProfile(patient);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageTitle, setImageTitle] = useState('prescription');
  const [prescriptionText, setPrescriptionText] = useState('');
  const [warning, setWarning] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<PrescriptionAnalyzeResponse | null>(null);

  async function resizeImage(uri: string) {
    const resized = await manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      { compress: 0.84, format: SaveFormat.JPEG },
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
      setWarning('');
      setAnalysis(null);
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
      setWarning('');
      setAnalysis(null);
    }
  }

  async function submitPrescription() {
    if (!imageUri) {
      setWarning('Please upload or take a clear prescription image first.');
      return;
    }
    if (!imageTitle.trim() && !prescriptionText.trim()) {
      setWarning('Please add the prescription title or visible medicine text.');
      return;
    }
    setIsSubmitting(true);
    setWarning('');
    try {
      const response = await analyzePrescription({
        imageUri,
        imageTitle,
        prescriptionText,
        patient: patientProfile,
      });
      setAnalysis(response);
      if (!response.is_prescription) {
        setWarning(response.warning);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prescription analysis failed.';
      Alert.alert(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function downloadTimetable() {
    if (!analysis) {
      return;
    }
    const html = buildTimetableHtml(patientProfile, analysis);
    if (Platform.OS === 'web') {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `swasthi-prescription-timetable-${Date.now()}.html`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    Alert.alert('Timetable ready', 'Open this module on web to download the timetable file.');
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={[styles.screen, { maxWidth: Math.min(width, 430) }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/geospatial-analysis')} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Prescription Management</Text>
        </View>

        <View style={styles.heroPanel}>
          <Text style={styles.kicker}>Medicine timetable</Text>
          <Text style={styles.heroTitle}>Upload Prescription</Text>
          <Text style={styles.heroText}>OCR reads the prescription image and creates a simple schedule for medicine, timing, food instructions, and duration.</Text>
        </View>

        <PrivacyNotice />

        <View style={styles.panel}>
          <Text style={styles.kicker}>Prescription image</Text>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>No prescription image selected</Text>
            </View>
          )}
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={takePhoto} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Take Photo</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={choosePhoto} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Choose</Text>
            </Pressable>
          </View>
          <TextInput
            value={imageTitle}
            onChangeText={setImageTitle}
            placeholder="Image title, e.g. prescription on paper"
            placeholderTextColor="#6E8A6E"
            style={styles.input}
          />
          <TextInput
            value={prescriptionText}
            onChangeText={setPrescriptionText}
            placeholder="Optional backup text if handwriting is unclear"
            placeholderTextColor="#6E8A6E"
            multiline
            style={[styles.input, styles.textArea]}
          />
          {warning ? <Text style={styles.warning}>{warning}</Text> : null}
          <Pressable
            accessibilityRole="button"
            onPress={submitPrescription}
            disabled={isSubmitting}
            style={({ pressed }) => [styles.submitButton, isSubmitting && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.submitText}>{isSubmitting ? 'Reading...' : 'Create Timetable'}</Text>
          </Pressable>
        </View>

        {analysis?.is_prescription ? (
          <View style={styles.resultPanel}>
            <Text style={styles.kicker}>AI timetable</Text>
            <Text style={styles.modelText}>
              {analysis.model_name} · Accuracy {analysis.accuracy == null ? 'not available' : `${Math.round(analysis.accuracy * 100)}%`}
            </Text>
            {analysis.extracted_text ? (
              <View style={styles.ocrPanel}>
                <Text style={styles.kicker}>Text read from image</Text>
                <Text style={styles.ocrText}>{analysis.extracted_text}</Text>
              </View>
            ) : null}
            {analysis.timetable.map((item, index) => (
              <View key={`${item.medicine}-${index}`} style={styles.medicineCard}>
                <Text style={styles.medicineName}>{item.medicine}</Text>
                <Text style={styles.medicineLine}>Dose: {item.dose}</Text>
                <Text style={styles.medicineLine}>When: {item.times.join(', ')}</Text>
                <Text style={styles.medicineLine}>How often: {item.frequency}</Text>
                <Text style={styles.medicineLine}>Food: {item.food_timing}</Text>
                <Text style={styles.medicineLine}>Duration: {item.duration}</Text>
                <Text style={styles.instruction}>{item.instructions}</Text>
              </View>
            ))}
            <Pressable accessibilityRole="button" onPress={downloadTimetable} style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}>
              <Text style={styles.reportText}>Download Timetable</Text>
            </Pressable>
          </View>
        ) : null}
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

function buildTimetableHtml(patient: PatientProfile, analysis: PrescriptionAnalyzeResponse) {
  const rows = analysis.timetable.map((item) => `
    <tr>
      <td>${escapeHtml(item.medicine)}</td>
      <td>${escapeHtml(item.dose)}</td>
      <td>${escapeHtml(item.times.join(', '))}</td>
      <td>${escapeHtml(item.frequency)}</td>
      <td>${escapeHtml(item.food_timing)}</td>
      <td>${escapeHtml(item.duration)}</td>
    </tr>
  `).join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Swasthi Prescription Timetable</title>
  <style>
    body { font-family: Arial, sans-serif; color: #17331C; margin: 28px; }
    h1 { margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #C9DCC4; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #ECF8ED; }
    .note { color: #4B6B4B; }
  </style>
</head>
<body>
  <h1>Swasthi Prescription Timetable</h1>
  <p class="note">AI-assisted schedule. Confirm with the original prescription or doctor.</p>
  <h2>Patient Details</h2>
  <p><strong>Name:</strong> ${escapeHtml(patient.name ?? '-')}<br />
  <strong>Sex:</strong> ${escapeHtml(patient.sex ?? '-')}<br />
  <strong>Age:</strong> ${escapeHtml(patient.age ?? '-')}</p>
  <h2>Text Read From Image</h2>
  <p>${escapeHtml(analysis.extracted_text || 'No readable text found.')}</p>
  <h2>Medicine Schedule</h2>
  <table>
    <tr><th>Medicine</th><th>Dose</th><th>Time</th><th>Frequency</th><th>Food</th><th>Duration</th></tr>
    ${rows}
  </table>
  <h2>Model Details</h2>
  <p><strong>Model:</strong> ${escapeHtml(analysis.model_name)}<br />
  <strong>Dataset:</strong> ${escapeHtml(analysis.dataset_name)}<br />
  <strong>Accuracy:</strong> ${analysis.accuracy == null ? '-' : `${Math.round(analysis.accuracy * 100)}%`}</p>
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

const colors = {
  background: '#F6FAF5',
  deepGreen: '#17331C',
  green: '#3A683D',
  muted: '#58745B',
  paleGreen: '#EAF4E7',
  white: '#FFFFFF',
  red: '#B94A48',
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { alignItems: 'center', padding: 18 },
  screen: { width: '100%', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paleGreen,
  },
  backText: { color: colors.deepGreen, fontSize: 34, lineHeight: 36, fontWeight: '700' },
  title: { flex: 1, color: colors.deepGreen, fontSize: 25, lineHeight: 31, fontWeight: '900' },
  heroPanel: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    padding: 18,
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: { color: colors.deepGreen, fontSize: 30, lineHeight: 36, fontWeight: '900' },
  heroText: { color: colors.muted, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  panel: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    padding: 14,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: '#F9FCF8',
  },
  placeholder: {
    height: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: '#F9FCF8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  placeholderText: { color: colors.muted, fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
    paddingHorizontal: 14,
  },
  primaryText: { color: colors.white, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paleGreen,
    paddingHorizontal: 14,
  },
  secondaryText: { color: colors.deepGreen, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: '#F9FCF8',
    paddingHorizontal: 12,
    color: colors.deepGreen,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  textArea: {
    minHeight: 132,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  warning: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
  },
  submitButton: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deepGreen,
  },
  submitText: { color: colors.white, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  resultPanel: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#B8DDBB',
    backgroundColor: '#ECF8ED',
    padding: 16,
  },
  modelText: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  medicineCard: {
    gap: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    padding: 12,
  },
  medicineName: { color: colors.deepGreen, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  medicineLine: { color: colors.deepGreen, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  instruction: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  ocrPanel: {
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: '#F9FCF8',
    padding: 12,
  },
  ocrText: {
    color: colors.deepGreen,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  reportButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  reportText: { color: colors.white, fontSize: 16, lineHeight: 21, fontWeight: '900' },
});
