import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider } from "@/contexts/AppContext";
import { NavigationContainer } from "@react-navigation/native";
import { ConvexProvider, ConvexReactClient } from "convex/react";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ConvexProvider client={convex}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="feed" options={{ animation: 'fade' }} />
              <Stack.Screen name="composer" options={{ presentation: "fullScreenModal" }} />
              <Stack.Screen name="loader" options={{ gestureEnabled: false }} />
              <Stack.Screen name="result" options={{ gestureEnabled: false, animation: 'none' }} />
            </Stack>
          </AppProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ConvexProvider>
  );
}
