import { useRouter } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View, Text, Animated, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';
import { useFonts, Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';

export default function IntroScreen() {
  const router = useRouter();
  const { userId, isLoading } = useApp();
  const [hasNavigated, setHasNavigated] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
  });
  
  const videoSource = require('../assets/third_intro_ultra.mp4');
  
  // Crossfade video loop logic
  const video1Ref = useRef<Video>(null);
  const video2Ref = useRef<Video>(null);
  const video1Opacity = useRef(new Animated.Value(1)).current;
  const video2Opacity = useRef(new Animated.Value(0)).current;
  const activeVideo = useRef<1 | 2>(1);
  const isTransitioning = useRef(false);
  
  const FADE_DURATION = 800;
  const TRIGGER_BEFORE_END = 1000;
  
  const handleVideo1Status = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    const duration = status.durationMillis || 0;
    const position = status.positionMillis || 0;
    const timeLeft = duration - position;
    
    if (activeVideo.current === 1 && timeLeft < TRIGGER_BEFORE_END && timeLeft > 0 && !isTransitioning.current) {
      isTransitioning.current = true;
      
      video2Ref.current?.setPositionAsync(0);
      video2Ref.current?.playAsync();
      
      Animated.parallel([
        Animated.timing(video1Opacity, { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
        Animated.timing(video2Opacity, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
      ]).start(() => {
        activeVideo.current = 2;
        isTransitioning.current = false;
        video1Ref.current?.pauseAsync();
      });
    }
  }, [video1Opacity, video2Opacity]);
  
  const handleVideo2Status = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    const duration = status.durationMillis || 0;
    const position = status.positionMillis || 0;
    const timeLeft = duration - position;
    
    if (activeVideo.current === 2 && timeLeft < TRIGGER_BEFORE_END && timeLeft > 0 && !isTransitioning.current) {
      isTransitioning.current = true;
      
      video1Ref.current?.setPositionAsync(0);
      video1Ref.current?.playAsync();
      
      Animated.parallel([
        Animated.timing(video2Opacity, { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
        Animated.timing(video1Opacity, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
      ]).start(() => {
        activeVideo.current = 1;
        isTransitioning.current = false;
        video2Ref.current?.pauseAsync();
      });
    }
  }, [video1Opacity, video2Opacity]);

  // Handle video playback errors
  const handleVideoError = (error: any) => {
    console.error('[IntroScreen] Video playback error:', error);
    setVideoError(true);
  };

  // Navigate to the appropriate screen
  const navigateToNextScreen = () => {
    if (hasNavigated) return;
    setHasNavigated(true);
    
    if (userId) {
      // User is authenticated
      if (ENABLE_TEST_RUN_MODE) {
        // Test mode: always go to onboarding for testing
        router.replace('/onboarding');
      } else {
        // Normal mode: go to feed
        router.replace('/(tabs)');
      }
    } else {
      // No user, go to auth
      router.replace('/auth');
    }
  };

  // Handle navigation based on user state
  useEffect(() => {
    if (isLoading || !fontsLoaded) return;

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
  }, [fadeAnim, userId, isLoading, fontsLoaded]);

  // Show loading indicator while fonts are loading
  if (!fontsLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!videoError && (
        <>
          <Animated.View style={[styles.videoContainer, { opacity: video1Opacity }]}>
            <Video
              ref={video1Ref}
              source={videoSource}
              style={styles.videoBackground}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isMuted
              onPlaybackStatusUpdate={handleVideo1Status}
              onError={handleVideoError}
              progressUpdateIntervalMillis={100}
            />
          </Animated.View>
          <Animated.View style={[styles.videoContainer, { opacity: video2Opacity }]}>
            <Video
              ref={video2Ref}
              source={videoSource}
              style={styles.videoBackground}
              resizeMode={ResizeMode.COVER}
              isMuted
              onPlaybackStatusUpdate={handleVideo2Status}
              onError={handleVideoError}
              progressUpdateIntervalMillis={100}
            />
          </Animated.View>
        </>
      )}
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
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  videoBackground: {
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
    fontFamily: Fonts.title,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
