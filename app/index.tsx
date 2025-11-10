import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';

export default function IntroScreen() {
  const router = useRouter();
  const { userId, isLoading } = useApp();
  const [hasNavigated, setHasNavigated] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  
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

  // Show buttons after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowButtons(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

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
    <View style={styles.container}>
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
      {showButtons && (
        <View style={styles.overlayContainer}>
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0.9)']}
            style={styles.overlay}
          >
            <TouchableOpacity 
              style={styles.button}
              onPress={() => {
                setHasNavigated(true);
                router.replace('/auth');
              }}
            >
              <Text style={styles.buttonText}>Get started</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]}
              onPress={() => {
                setHasNavigated(true);
                router.replace('/auth');
              }}
            >
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>Log In</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}
    </View>
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
  overlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  overlay: {
    paddingHorizontal: 30,
    paddingTop: 80,
    paddingBottom: 50,
    alignItems: 'center',
  },
  button: {
    backgroundColor: Colors.white,
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 18,
    fontFamily: Fonts.regular,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: Colors.white,
  },
});
