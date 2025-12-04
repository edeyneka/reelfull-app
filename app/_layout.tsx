import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { PaywallProvider } from "@/contexts/PaywallContext";
import { useFonts, Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { registerForPushNotificationsAsync } from "@/lib/videoPollingService";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Constants from 'expo-constants';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Initialize Convex client
// Try multiple sources for the Convex URL
const convexUrl = 
  process.env.EXPO_PUBLIC_CONVEX_URL || 
  Constants.expoConfig?.extra?.convexUrl ||
  'https://industrious-ibex-578.convex.cloud';

console.log('[App] Initializing Convex client...');
console.log('[App] process.env.EXPO_PUBLIC_CONVEX_URL:', process.env.EXPO_PUBLIC_CONVEX_URL);
console.log('[App] Constants.expoConfig.extra.convexUrl:', Constants.expoConfig?.extra?.convexUrl);
console.log('[App] Final Convex URL:', convexUrl);

if (!process.env.EXPO_PUBLIC_CONVEX_URL) {
  console.warn('[App] EXPO_PUBLIC_CONVEX_URL is not set in process.env. Using fallback.');
}

const convex = new ConvexReactClient(convexUrl);
console.log('[App] Convex client created with URL:', convexUrl);

function AppContent() {
  const { userId } = useApp();
  const updatePushToken = useMutation(api.users.updatePushToken);

  useEffect(() => {
    // Register for push notifications when user is authenticated
    if (userId) {
      registerForPushNotificationsAsync()
        .then(async (token) => {
          if (token) {
            console.log('[App] Registering push token with backend...');
            try {
              await updatePushToken({ userId, pushToken: token });
              console.log('[App] Push token registered successfully');
            } catch (error) {
              console.error('[App] Failed to register push token:', error);
            }
          }
        })
        .catch((error) => {
          console.error('[App] Error registering for push notifications:', error);
        });
    }
  }, [userId]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="feed" options={{ animation: 'fade' }} />
      <Stack.Screen 
        name="composer" 
        options={{ 
          presentation: "transparentModal",
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' }
        }} 
      />
      <Stack.Screen name="script-review" options={{ gestureEnabled: false }} />
      <Stack.Screen name="loader" options={{ gestureEnabled: false }} />
      <Stack.Screen name="result" options={{ gestureEnabled: false, animation: 'none' }} />
      <Stack.Screen 
        name="settings" 
        options={{ 
          presentation: "transparentModal",
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' }
        }} 
      />
      <Stack.Screen 
        name="paywall" 
        options={{ 
          presentation: "modal",
          animation: 'slide_from_bottom',
        }} 
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ConvexProvider client={convex}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppProvider>
              <PaywallProvider>
                <AppContent />
              </PaywallProvider>
            </AppProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ConvexProvider>
  );
}
