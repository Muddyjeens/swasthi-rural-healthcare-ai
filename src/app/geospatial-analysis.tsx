import { useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { moduleCopyByLanguage } from '@/constants/module-copy';
import { PrivacyNotice } from '@/components/privacy-notice';
import { getPhcRoute } from '@/services/swasthi-api';
import { LanguageId, useLanguage } from '@/state/language-context';

type RoutePayload = {
  name: string;
  address: string;
  distance_km: number | null;
  maps_url: string;
};

const defaultVillage = {
  name: 'Suryanagar village, Karnataka',
  latitude: 12.7735,
  longitude: 77.703,
};

const demoVillages = [
  defaultVillage,
  { name: 'Marsur village, Karnataka', latitude: 12.7635, longitude: 77.7005 },
  { name: 'Byagadadenahalli village, Karnataka', latitude: 12.7582, longitude: 77.7056 },
  { name: 'Sriperumbudur village, Tamil Nadu', latitude: 12.9676, longitude: 79.9419 },
  { name: 'Vellarada village, Kerala', latitude: 8.3736, longitude: 77.1962 },
  { name: 'Bassi village, Rajasthan', latitude: 26.8318, longitude: 76.0488 },
  { name: 'Mandal village, Gujarat', latitude: 23.2886, longitude: 71.9185 },
  { name: 'Barasat village, West Bengal', latitude: 22.7248, longitude: 88.4789 },
  { name: 'Talegaon village, Maharashtra', latitude: 18.735, longitude: 73.6759 },
  { name: 'Kondapur village, Telangana', latitude: 17.4658, longitude: 78.3564 },
];

export default function GeospatialAnalysisScreen() {
  const router = useRouter();
  const { route, confidence, patient } = useLocalSearchParams<{ route?: string; confidence?: string; patient?: string }>();
  const { selectedLanguage } = useLanguage();
  const { width } = useWindowDimensions();
  const copy = moduleCopyByLanguage[selectedLanguage];
  const geoCopy = geospatialCopyByLanguage[selectedLanguage];
  const initialRoute = useMemo(() => parseRoute(route), [route]);
  const [routeResult, setRouteResult] = useState<RoutePayload | null>(initialRoute);
  const [latitude, setLatitude] = useState(String(defaultVillage.latitude));
  const [longitude, setLongitude] = useState(String(defaultVillage.longitude));
  const [locationLabel, setLocationLabel] = useState(defaultVillage.name);
  const [villageSearch, setVillageSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const filteredVillages = demoVillages.filter((village) =>
    village.name.toLowerCase().includes(villageSearch.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!initialRoute) {
      loadDefaultRoute();
    }
  }, [initialRoute]);

  async function loadDefaultRoute() {
    await loadRoute(defaultVillage.latitude, defaultVillage.longitude, defaultVillage.name);
  }

  async function useAutoLocation() {
    try {
      setIsLoading(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        await loadDefaultRoute();
        Alert.alert(geoCopy.permissionFallback);
        return;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextLat = current.coords.latitude;
      const nextLon = current.coords.longitude;
      setLatitude(String(roundCoordinate(nextLat)));
      setLongitude(String(roundCoordinate(nextLon)));
      await loadRoute(nextLat, nextLon, 'Detected location');
    } catch (error) {
      await loadDefaultRoute();
      const message = error instanceof Error ? error.message : geoCopy.locationFailed;
      Alert.alert(`${message} ${geoCopy.usingDefault}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function useManualLocation() {
    const nextLat = Number(latitude);
    const nextLon = Number(longitude);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLon)) {
      Alert.alert(geoCopy.invalidCoordinates);
      return;
    }
    await loadRoute(nextLat, nextLon, 'Manual location');
  }

  async function useVillage(village: typeof demoVillages[number]) {
    await loadRoute(village.latitude, village.longitude, village.name);
  }

  async function loadRoute(nextLat: number, nextLon: number, label: string) {
    setIsLoading(true);
    try {
      const response = await getPhcRoute({ latitude: nextLat, longitude: nextLon });
      setRouteResult(response);
      setLocationLabel(label);
      setLatitude(String(roundCoordinate(nextLat)));
      setLongitude(String(roundCoordinate(nextLon)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not find a PHC route.';
      Alert.alert(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={[styles.screen, { maxWidth: Math.min(width, 430) }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.backButton}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{copy.geospatialTitle}</Text>
        </View>

        <View style={styles.heroPanel}>
          <Text style={styles.kicker}>{geoCopy.routeToCare}</Text>
          <Text style={styles.heroTitle}>{copy.nearestPhc}</Text>
          <Text style={styles.heroText}>
            {locationLabel} · {copy.confidence}: {Math.round(Number(confidence ?? 0.99) * 100)}%
          </Text>
        </View>

        <PrivacyNotice />

        <View style={styles.locationPanel}>
          <Text style={styles.kicker}>{geoCopy.chooseLocation}</Text>
          <View style={styles.mapPanel}>
            <View style={styles.mapGrid} />
            <View style={styles.waterBlock} />
            <View style={styles.parkBlock} />
            <View style={styles.roadHorizontal} />
            <View style={styles.roadVertical} />
            <View style={[styles.pin, styles.userPin]}>
              <Text style={styles.pinText}>{geoCopy.userPin}</Text>
            </View>
            <View style={[styles.pin, styles.phcPin]}>
              <Text style={styles.pinText}>+</Text>
            </View>
            <View style={styles.routeLine} />
            <Text style={styles.mapMiniLabel}>{geoCopy.demoMap}</Text>
            <Text style={styles.mapLabel}>{locationLabel}</Text>
            {routeResult ? <Text style={styles.mapPhcLabel}>{routeResult.name}</Text> : null}
          </View>
          {routeResult ? (
            <View style={styles.quickRoute}>
              <Text style={styles.quickRouteName}>{routeResult.name}</Text>
              <Text style={styles.quickRouteDistance}>
                {routeResult.distance_km == null ? copy.distanceUnavailable : `${routeResult.distance_km} ${copy.awayFromTestOrigin}`}
              </Text>
            </View>
          ) : null}
          <TextInput
            value={villageSearch}
            onChangeText={setVillageSearch}
            placeholder={geoCopy.searchVillage}
            placeholderTextColor="#6E8A6E"
            style={styles.searchInput}
          />
          <View style={styles.villageList}>
            {filteredVillages.map((village) => (
              <Pressable
                key={village.name}
                accessibilityRole="button"
                onPress={() => useVillage(village)}
                style={({ pressed }) => [styles.villageButton, pressed && styles.pressed]}>
                <Text style={styles.villageName}>{village.name}</Text>
                <Text style={styles.villageCoords}>{village.latitude}, {village.longitude}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.coordinateRow}>
            <TextInput
              value={latitude}
              onChangeText={setLatitude}
              keyboardType="decimal-pad"
              placeholder={geoCopy.latitude}
              placeholderTextColor="#6E8A6E"
              style={styles.coordinateInput}
            />
            <TextInput
              value={longitude}
              onChangeText={setLongitude}
              keyboardType="decimal-pad"
              placeholder={geoCopy.longitude}
              placeholderTextColor="#6E8A6E"
              style={styles.coordinateInput}
            />
          </View>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={useAutoLocation}
              disabled={isLoading}
              style={({ pressed }) => [styles.primaryButton, isLoading && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{isLoading ? geoCopy.finding : geoCopy.autoLocation}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={useManualLocation}
              disabled={isLoading}
              style={({ pressed }) => [styles.secondaryAction, isLoading && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.secondaryActionText}>{geoCopy.useTyped}</Text>
            </Pressable>
          </View>
        </View>

        {routeResult ? (
          <View style={styles.routePanel}>
            <Text style={styles.kicker}>{copy.routeDetails}</Text>
            <Text style={styles.phcName}>{routeResult.name}</Text>
            <Text style={styles.routeText}>{routeResult.address}</Text>
            <Text style={styles.distanceText}>
              {routeResult.distance_km == null ? copy.distanceUnavailable : `${routeResult.distance_km} ${copy.awayFromTestOrigin}`}
            </Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(routeResult.maps_url)}
              style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}>
              <Text style={styles.mapText}>{copy.openRoute}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/prescription-management', params: { patient } })}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{geoCopy.prescriptionManagement}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.routePanel}>
            <Text style={styles.routeText}>{isLoading ? geoCopy.findingPhc : copy.distanceUnavailable}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          style={({ pressed }) => [styles.backHomeButton, pressed && styles.pressed]}>
          <Text style={styles.backHomeText}>{geoCopy.home}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const geospatialCopyByLanguage: Record<LanguageId, {
  routeToCare: string;
  chooseLocation: string;
  demoMap: string;
  searchVillage: string;
  latitude: string;
  longitude: string;
  autoLocation: string;
  useTyped: string;
  finding: string;
  findingPhc: string;
  home: string;
  userPin: string;
  invalidCoordinates: string;
  permissionFallback: string;
  locationFailed: string;
  usingDefault: string;
  prescriptionManagement: string;
}> = {
  english: {
    routeToCare: 'Route to care',
    chooseLocation: 'Choose Location',
    demoMap: 'Demo map',
    searchVillage: 'Search demo village',
    latitude: 'Latitude',
    longitude: 'Longitude',
    autoLocation: 'Auto Location',
    useTyped: 'Use Typed',
    finding: 'Finding...',
    findingPhc: 'Finding nearest PHC...',
    home: 'Home',
    userPin: 'U',
    invalidCoordinates: 'Enter valid latitude and longitude.',
    permissionFallback: 'Location permission was not granted. Using the default village location.',
    locationFailed: 'Could not read location.',
    usingDefault: 'Using the default village location.',
    prescriptionManagement: 'Move to Prescription Management',
  },
  hindi: {
    routeToCare: 'देखभाल का मार्ग',
    chooseLocation: 'स्थान चुनें',
    demoMap: 'डेमो नक्शा',
    searchVillage: 'डेमो गांव खोजें',
    latitude: 'अक्षांश',
    longitude: 'देशांतर',
    autoLocation: 'स्वचालित स्थान',
    useTyped: 'लिखा हुआ उपयोग करें',
    finding: 'खोज रहा है...',
    findingPhc: 'नज़दीकी PHC खोज रहा है...',
    home: 'होम',
    userPin: 'आप',
    invalidCoordinates: 'सही अक्षांश और देशांतर दर्ज करें।',
    permissionFallback: 'स्थान अनुमति नहीं मिली। डिफ़ॉल्ट गांव स्थान उपयोग कर रहे हैं।',
    locationFailed: 'स्थान पढ़ा नहीं जा सका।',
    usingDefault: 'डिफ़ॉल्ट गांव स्थान उपयोग कर रहे हैं।',
    prescriptionManagement: 'प्रिस्क्रिप्शन प्रबंधन पर जाएं',
  },
  kannada: {
    routeToCare: 'ಚಿಕಿತ್ಸೆಗೆ ಮಾರ್ಗ',
    chooseLocation: 'ಸ್ಥಳ ಆಯ್ಕೆಮಾಡಿ',
    demoMap: 'ಡೆಮೊ ನಕ್ಷೆ',
    searchVillage: 'ಡೆಮೊ ಗ್ರಾಮ ಹುಡುಕಿ',
    latitude: 'ಅಕ್ಷಾಂಶ',
    longitude: 'ರೇಖಾಂಶ',
    autoLocation: 'ಸ್ವಯಂ ಸ್ಥಳ',
    useTyped: 'ಟೈಪ್ ಮಾಡಿದದ್ದು ಬಳಸಿ',
    finding: 'ಹುಡುಕುತ್ತಿದೆ...',
    findingPhc: 'ಹತ್ತಿರದ PHC ಹುಡುಕುತ್ತಿದೆ...',
    home: 'ಮನೆ',
    userPin: 'ನೀವು',
    invalidCoordinates: 'ಸರಿಯಾದ ಅಕ್ಷಾಂಶ ಮತ್ತು ರೇಖಾಂಶ ನಮೂದಿಸಿ.',
    permissionFallback: 'ಸ್ಥಳ ಅನುಮತಿ ಸಿಗಲಿಲ್ಲ. ಡೀಫಾಲ್ಟ್ ಗ್ರಾಮ ಸ್ಥಳ ಬಳಸಲಾಗುತ್ತಿದೆ.',
    locationFailed: 'ಸ್ಥಳ ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
    usingDefault: 'ಡೀಫಾಲ್ಟ್ ಗ್ರಾಮ ಸ್ಥಳ ಬಳಸಲಾಗುತ್ತಿದೆ.',
    prescriptionManagement: 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಶನ್ ನಿರ್ವಹಣೆಗೆ ಹೋಗಿ',
  },
  tamil: {
    routeToCare: 'சிகிச்சைக்கான பாதை',
    chooseLocation: 'இடத்தை தேர்வு செய்யவும்',
    demoMap: 'டெமோ வரைபடம்',
    searchVillage: 'டெமோ கிராமம் தேடு',
    latitude: 'அட்சரேகை',
    longitude: 'தீர்க்கரேகை',
    autoLocation: 'தானியங்கி இடம்',
    useTyped: 'உள்ளிட்டதை பயன்படுத்து',
    finding: 'தேடுகிறது...',
    findingPhc: 'அருகிலுள்ள PHC தேடப்படுகிறது...',
    home: 'முகப்பு',
    userPin: 'நீங்கள்',
    invalidCoordinates: 'சரியான அட்சரேகை மற்றும் தீர்க்கரேகையை உள்ளிடவும்.',
    permissionFallback: 'இட அனுமதி கிடைக்கவில்லை. இயல்புநிலை கிராம இடம் பயன்படுத்தப்படுகிறது.',
    locationFailed: 'இடத்தை படிக்க முடியவில்லை.',
    usingDefault: 'இயல்புநிலை கிராம இடம் பயன்படுத்தப்படுகிறது.',
    prescriptionManagement: 'மருந்துச் சீட்டு நிர்வாகத்துக்கு செல்',
  },
  telugu: {
    routeToCare: 'చికిత్సకు మార్గం',
    chooseLocation: 'స్థానాన్ని ఎంచుకోండి',
    demoMap: 'డెమో మ్యాప్',
    searchVillage: 'డెమో గ్రామం వెతకండి',
    latitude: 'అక్షాంశం',
    longitude: 'రేఖాంశం',
    autoLocation: 'ఆటో స్థానం',
    useTyped: 'టైప్ చేసినది వాడండి',
    finding: 'వెతుకుతోంది...',
    findingPhc: 'సమీప PHC వెతుకుతోంది...',
    home: 'హోమ్',
    userPin: 'మీరు',
    invalidCoordinates: 'సరైన అక్షాంశం మరియు రేఖాంశం ఇవ్వండి.',
    permissionFallback: 'స్థాన అనుమతి రాలేదు. డిఫాల్ట్ గ్రామ స్థానాన్ని వాడుతున్నాం.',
    locationFailed: 'స్థానాన్ని చదవలేకపోయింది.',
    usingDefault: 'డిఫాల్ట్ గ్రామ స్థానాన్ని వాడుతున్నాం.',
    prescriptionManagement: 'ప్రిస్క్రిప్షన్ నిర్వహణకు వెళ్లండి',
  },
  marathi: {
    routeToCare: 'काळजीचा मार्ग',
    chooseLocation: 'स्थान निवडा',
    demoMap: 'डेमो नकाशा',
    searchVillage: 'डेमो गाव शोधा',
    latitude: 'अक्षांश',
    longitude: 'रेखांश',
    autoLocation: 'स्वयंचलित स्थान',
    useTyped: 'लिहिलेले वापरा',
    finding: 'शोधत आहे...',
    findingPhc: 'जवळचे PHC शोधत आहे...',
    home: 'होम',
    userPin: 'तुम्ही',
    invalidCoordinates: 'योग्य अक्षांश आणि रेखांश द्या.',
    permissionFallback: 'स्थान परवानगी मिळाली नाही. डिफॉल्ट गाव स्थान वापरत आहे.',
    locationFailed: 'स्थान वाचता आले नाही.',
    usingDefault: 'डिफॉल्ट गाव स्थान वापरत आहे.',
    prescriptionManagement: 'प्रिस्क्रिप्शन व्यवस्थापनाकडे जा',
  },
};

function parseRoute(value?: string): RoutePayload | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as RoutePayload;
  } catch {
    return null;
  }
}

function roundCoordinate(value: number) {
  return Math.round(value * 10000) / 10000;
}

const colors = {
  background: '#F6FAF5',
  green: '#3A683D',
  deepGreen: '#17331C',
  paleGreen: '#DCEED8',
  text: '#17281B',
  muted: '#6E8A6E',
  white: '#FFFFFF',
  red: '#C33232',
  amber: '#F6D98D',
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    alignItems: 'center',
    padding: 18,
  },
  screen: {
    width: '100%',
    gap: 16,
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
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
  },
  heroPanel: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    padding: 18,
  },
  heroTitle: {
    color: colors.deepGreen,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  heroText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  locationPanel: {
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    padding: 14,
  },
  mapPanel: {
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#EAF4E7',
    borderWidth: 1,
    borderColor: '#C9DCC4',
  },
  mapGrid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#EAF4E7',
  },
  waterBlock: {
    position: 'absolute',
    left: -20,
    top: 18,
    width: 128,
    height: 64,
    borderRadius: 28,
    backgroundColor: '#CFE8F1',
    transform: [{ rotate: '-16deg' }],
  },
  parkBlock: {
    position: 'absolute',
    right: -18,
    bottom: 22,
    width: 132,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#D8EFCF',
    transform: [{ rotate: '12deg' }],
  },
  roadHorizontal: {
    position: 'absolute',
    left: -20,
    right: -20,
    top: '49%',
    height: 18,
    backgroundColor: '#F8F2D5',
    transform: [{ rotate: '-12deg' }],
  },
  roadVertical: {
    position: 'absolute',
    left: '44%',
    top: -24,
    width: 16,
    height: 260,
    backgroundColor: '#F8F2D5',
    transform: [{ rotate: '22deg' }],
  },
  routeLine: {
    position: 'absolute',
    left: '28%',
    top: '52%',
    width: '48%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.green,
    transform: [{ rotate: '-18deg' }],
  },
  pin: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  userPin: {
    left: '22%',
    top: '58%',
    backgroundColor: colors.deepGreen,
  },
  phcPin: {
    right: '20%',
    top: '32%',
    backgroundColor: colors.red,
  },
  pinText: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  mapLabel: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    maxWidth: '48%',
    color: colors.deepGreen,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  mapMiniLabel: {
    position: 'absolute',
    left: 12,
    top: 12,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mapPhcLabel: {
    position: 'absolute',
    right: 12,
    top: 12,
    maxWidth: '48%',
    color: colors.red,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'right',
  },
  coordinateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  coordinateInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: '#F9FCF8',
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  searchInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: '#F9FCF8',
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  villageList: {
    gap: 8,
    maxHeight: 190,
  },
  quickRoute: {
    gap: 2,
    borderRadius: 14,
    backgroundColor: '#EEF7EC',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickRouteName: {
    color: colors.deepGreen,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  quickRouteDistance: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  villageButton: {
    gap: 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E8D3',
    backgroundColor: '#F9FCF8',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  villageName: {
    color: colors.deepGreen,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  villageCoords: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deepGreen,
  },
  primaryText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.green,
    backgroundColor: colors.white,
  },
  secondaryActionText: {
    color: colors.deepGreen,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  routePanel: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C9DCC4',
    backgroundColor: colors.white,
    padding: 16,
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  phcName: {
    color: colors.deepGreen,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
  },
  routeText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  distanceText: {
    color: colors.red,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  mapButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.deepGreen,
  },
  mapText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  backHomeButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paleGreen,
  },
  backHomeText: {
    color: colors.deepGreen,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.58,
  },
  pressed: {
    opacity: 0.82,
  },
});
