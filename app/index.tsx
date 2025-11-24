import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Text, Animated } from 'react-native';
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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  const videoSource = require('../assets/third_intro_ultra.mp4');

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

  // Handle navigation based on user state
  useEffect(() => {
    if (isLoading) return;

    if (userId) {
      // User is already authenticated - show intro for 3 seconds then go to feed
      const timer = setTimeout(() => {
        navigateToNextScreen();
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      // New user - show buttons after 3 seconds with fade-in animation
      const timer = setTimeout(() => {
        setShowButtons(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [fadeAnim, userId, isLoading]);

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
        <Animated.View style={[styles.overlayContainer, { opacity: fadeAnim }]}>
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0.9)']}
            style={styles.overlay}
          >
            <Text style={styles.title}>Reelful</Text>
            <Text style={styles.subtitle}>Your memories, reimagined</Text>
            <TouchableOpacity 
              style={styles.buttonWrapper}
              onPress={() => {
                setHasNavigated(true);
                router.replace('/auth');
              }}
            >
              <LinearGradient
                colors={['#E85D2C', '#F57428', '#FF8C1F']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Get Started</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
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
  title: {
    fontSize: 42,
    fontFamily: Fonts.regular,
    color: Colors.white,
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: '#FF8C1F',
    marginBottom: 20,
    letterSpacing: 0.5,
    opacity: 0.95,
  },
  buttonWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: Colors.white,
    fontSize: 17,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
