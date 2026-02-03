import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      {/* Profile moved to stack screen in root layout */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // Hide from tab bar navigation
        }}
      />
    </Tabs>
  );
}
