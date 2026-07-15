import { Platform } from 'react-native';

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Unknown';

export type ChatMessagePayload = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatResponse = {
  reply: string;
  risk: RiskLevel;
  structured_symptoms: string[];
  next_step: string;
  should_escalate: boolean;
  possible_matches: {
    disease_group: string;
    confidence: number;
    matched_symptoms: string[];
    common_dataset_symptoms: string[];
  }[];
};

export type SubmittedVisionImagePayload = {
  title: string;
};

export type FinalAssessmentResponse = {
  risk: 'Low' | 'Medium' | 'High';
  confidence: number;
  summary: string;
  structured_symptoms: string[];
  possible_matches: {
    disease_group: string;
    confidence: number;
    matched_symptoms: string[];
    common_dataset_symptoms: string[];
  }[];
  remedies: string[];
  next_module: string;
  route: {
    name: string;
    address: string;
    distance_km: number | null;
    maps_url: string;
  } | null;
};

export type PrescriptionScheduleItem = {
  medicine: string;
  dose: string;
  frequency: string;
  times: string[];
  food_timing: string;
  duration: string;
  instructions: string;
};

export type PrescriptionAnalyzeResponse = {
  is_prescription: boolean;
  warning: string;
  extracted_text: string;
  timetable: PrescriptionScheduleItem[];
  model_name: string;
  dataset_name: string;
  accuracy: number | null;
  notes: string[];
};

const localHost = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
const apiBaseUrl = process.env.EXPO_PUBLIC_SWASTHI_API_URL ?? localHost;

export async function sendChatMessage({
  message,
  language,
  history,
}: {
  message: string;
  language: string;
  history: ChatMessagePayload[];
}): Promise<ChatResponse> {
  const response = await fetch(`${apiBaseUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      language,
      history,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function transcribeVoice({
  language,
  uri,
}: {
  language: string;
  uri: string;
}): Promise<{
  text: string;
  provider: string;
  is_stub: boolean;
}> {
  const audioBase64 = await uriToBase64(uri);

  const response = await fetch(`${apiBaseUrl}/voice-transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      language,
      audio_base64: audioBase64,
      filename: Platform.OS === 'web' ? 'voice.webm' : 'voice.m4a',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `Voice request failed with status ${response.status}`);
  }

  return response.json();
}

export async function submitFinalAssessment({
  messages,
  images,
  language,
}: {
  messages: ChatMessagePayload[];
  images: SubmittedVisionImagePayload[];
  language: string;
}): Promise<FinalAssessmentResponse> {
  const response = await fetch(`${apiBaseUrl}/assessment/final`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      images,
      language,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `Final assessment failed with status ${response.status}`);
  }

  return response.json();
}

export async function getPhcRoute({
  latitude,
  longitude,
}: {
  latitude?: number | null;
  longitude?: number | null;
}): Promise<NonNullable<FinalAssessmentResponse['route']>> {
  const response = await fetch(`${apiBaseUrl}/assessment/phc-route`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      latitude,
      longitude,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `PHC route failed with status ${response.status}`);
  }

  return response.json();
}

export async function analyzePrescription({
  imageUri,
  imageTitle,
  prescriptionText,
  patient,
}: {
  imageUri?: string | null;
  imageTitle: string;
  prescriptionText: string;
  patient: Record<string, string | undefined>;
}): Promise<PrescriptionAnalyzeResponse> {
  const imageBase64 = imageUri ? await uriToBase64(imageUri) : null;
  const response = await fetch(`${apiBaseUrl}/prescription/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      image_title: imageTitle,
      prescription_text: prescriptionText,
      patient,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail ?? `Prescription analysis failed with status ${response.status}`);
  }

  return response.json();
}

async function uriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read voice recording.'));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(blob);
  });
}
