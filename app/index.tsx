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

  // Show buttons after 3 seconds with fade-in animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowButtons(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }, 3000);

    return () => clearTimeout(timer);
  }, [fadeAnim]);

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
                <Text style={[styles.buttonText, styles.primaryButtonText]}>Get Started</Text>
              </LinearGradient>
            </TouchableOpacity>
            <View style={styles.buttonWrapper}>
              <TouchableOpacity 
                style={[styles.button, styles.secondaryButton]}
                onPress={() => {
                  setHasNavigated(true);
                  router.replace('/auth');
                }}
              >
                <Text style={[styles.buttonText, styles.secondaryButtonText]}>Log In</Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: 30,
    letterSpacing: -1,
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
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  buttonText: {
    color: Colors.black,
    fontSize: 17,
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  primaryButtonText: {
    color: Colors.white,
  },
  secondaryButtonText: {
    color: Colors.white,
  },
});
