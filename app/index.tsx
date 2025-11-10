import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

export default function IntroScreen() {
  const router = useRouter();
  const { userId, isLoading } = useApp();
  const [hasNavigated, setHasNavigated] = useState(false);
  
  const videoSource = require('../assets/third_intro.mp4');

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

  // Auto-navigate after a few seconds
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        navigateToNextScreen();
      }, 5000); // Show intro for 5 seconds

      return () => clearTimeout(timer);
    }
  }, [isLoading, userId, navigateToNextScreen]);

  return (
    <TouchableOpacity 
      style={styles.container} 
      activeOpacity={1}
      onPress={navigateToNextScreen}
    >
      <Video
        source={videoSource}
        style={styles.gif}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
        style={styles.gradient}
      />
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
});
