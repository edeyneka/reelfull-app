import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { useFonts, Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { registerForPushNotificationsAsync } from "@/lib/videoPollingService";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Initialize Convex client
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = new ConvexReactClient(convexUrl || "");

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
            <AppContent />
          </AppProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ConvexProvider>
  );
}
