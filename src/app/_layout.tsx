import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useColorScheme } from 'react-native';

import { LanguageProvider } from '@/state/language-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LanguageProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="conversation" />
          <Stack.Screen name="computer-vision" />
          <Stack.Screen name="geospatial-analysis" />
          <Stack.Screen name="prescription-management" />
        </Stack>
      </LanguageProvider>
    </ThemeProvider>
  );
}
