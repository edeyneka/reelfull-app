import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';

export default function IntroScreen() {
  const router = useRouter();
  const { userId, isLoading } = useApp();
  const [hasNavigated, setHasNavigated] = useState(false);
  
  const gifSource = require('../assets/intro-video.gif');

  // Navigate to the appropriate screen
  const navigateToNextScreen = () => {
    if (hasNavigated) return;
    setHasNavigated(true);
    
    if (userId) {
      // User is authenticated, go to feed
      router.replace('/feed');
    } else {
      // No user, go to auth
      router.replace('/auth');
    }
  };

  // Auto-navigate after a few seconds (GIF loops indefinitely, so we use a timer)
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        navigateToNextScreen();
      }, 3000); // Show intro for 3 seconds

      return () => clearTimeout(timer);
    }
  }, [isLoading, userId, navigateToNextScreen]);

  return (
    <TouchableOpacity 
      style={styles.container} 
      activeOpacity={1}
      onPress={navigateToNextScreen}
    >
      <Image
        source={gifSource}
        style={styles.gif}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
        style={styles.gradient}
      >
        <Text style={styles.title}>Reelful</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  gif: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    position: 'absolute',
    bottom: 120,
    fontSize: 50,
    fontFamily: Fonts.regular,
    color: Colors.white,
    letterSpacing: -1,
  },
});
