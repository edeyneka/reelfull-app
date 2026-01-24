import { Tabs, useRouter } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Home, Plus, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Colors from '@/constants/colors';

type TabBarProps = {
  state: any;
  descriptors: any;
  navigation: any;
};

function CustomTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const getIcon = (routeName: string, isFocused: boolean) => {
    const color = isFocused ? Colors.white : 'rgba(255, 255, 255, 0.5)';
    const size = 26;
    const strokeWidth = isFocused ? 2.5 : 2;

    switch (routeName) {
      case 'index':
        return <Home size={size} color={color} strokeWidth={strokeWidth} />;
      case 'profile':
        return <User size={size} color={color} strokeWidth={strokeWidth} />;
      default:
        return null;
    }
  };

  const handleCreatePress = () => {
    // Navigate to composer (outside of tabs)
    router.push('/composer');
  };

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.tabBarContainer}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={40} tint="dark" style={styles.blurBackground} />
        ) : (
          <View style={styles.androidBackground} />
        )}

        {/* Glass border overlay */}
        <View style={styles.glassBorder} />

        <View style={styles.tabBarContent}>
          {/* Home Tab */}
          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => navigation.navigate('index')}
            activeOpacity={0.7}
          >
            {getIcon('index', state.index === 0)}
          </TouchableOpacity>

          {/* Center Create Button */}
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreatePress}
            activeOpacity={0.8}
          >
            <View style={styles.createButtonInner}>
              <Plus size={26} color={Colors.white} strokeWidth={2.5} />
            </View>
          </TouchableOpacity>

          {/* Profile Tab */}
          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => navigation.navigate('profile')}
            activeOpacity={0.7}
          >
            {getIcon('profile', state.index === 1)}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
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
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  tabBarContainer: {
    width: 240,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    // Outer shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  blurBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(164, 164, 164, 0.08)',
  },
  androidBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(40, 40, 40, 0.85)',
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  tabBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  tabButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButton: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
