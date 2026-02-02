import { useRouter } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Animated,
  ActivityIndicator,
  Dimensions,
  Easing,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const REEL_SIZE = SCREEN_WIDTH * 1.8;

export default function IntroScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, isLoading } = useApp();
  const [hasNavigated, setHasNavigated] = useState(false);
  const [showButtons, setShowButtons] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const reelRotation = useRef(new Animated.Value(0)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const reelFade = useRef(new Animated.Value(0)).current;

  // Continuous reel rotation - start immediately and run forever
  useEffect(() => {
    const rotateAnimation = Animated.loop(
      Animated.timing(reelRotation, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateAnimation.start();
    return () => rotateAnimation.stop();
  }, []);

  // Initial entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(titleFade, {
        toValue: 1,
        duration: 800,
        delay: 300,
        useNativeDriver: true,
      }),
      Animated.timing(reelFade, {
        toValue: 1,
        duration: 1000,
        delay: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [titleFade, reelFade]);

  // Navigate to the appropriate screen
  const navigateToNextScreen = () => {
    if (hasNavigated) return;
    setHasNavigated(true);

    if (userId) {
      if (ENABLE_TEST_RUN_MODE) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    } else {
      router.replace('/auth');
    }
  };

  // Handle navigation based on user state
  useEffect(() => {
    if (isLoading) return;

    if (userId) {
      // User is already authenticated - show intro for 2 seconds then go to feed
      const timer = setTimeout(() => {
        navigateToNextScreen();
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      // New user - show buttons after 1.5 seconds with fade-in animation
      const timer = setTimeout(() => {
        setShowButtons(true);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [fadeAnim, userId, isLoading]);

  const spin = reelRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Title at top left */}
      <Animated.View
        style={[
          styles.titleContainer,
          { paddingTop: insets.top + 40, opacity: titleFade },
        ]}
      >
        <Text style={styles.title}>Reelful</Text>
      </Animated.View>

      {/* Rotating film reel on right side */}
      <Animated.View
        style={[
          styles.reelContainer,
          { opacity: reelFade },
        ]}
      >
        <Animated.Image
          source={require('../assets/images/reel.png')}
          style={[
            styles.reelImage,
            { transform: [{ rotate: spin }] },
          ]}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Bottom section with button and terms */}
      {showButtons && (
        <Animated.View
          style={[
            styles.bottomSection,
            { paddingBottom: insets.bottom + 24, opacity: fadeAnim },
          ]}
        >
          {/* Get Started button */}
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              setHasNavigated(true);
              router.replace('/auth');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </TouchableOpacity>

          {/* Terms text */}
          <Text style={styles.termsText}>
            By tapping "Get Started", you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://www.reelful.app/terms.html')}
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://www.reelful.app/privacy.html')}
            >
              Privacy Policy
            </Text>
          </Text>
        </Animated.View>
      )}

      {/* Loading indicator when checking auth */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.ember} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  titleContainer: {
    position: 'absolute',
    left: 32,
    zIndex: 10,
  },
  title: {
    fontSize: 50,
    fontFamily: Fonts.medium,
    color: Colors.ink,
    letterSpacing: -1,
  },
  reelContainer: {
    position: 'absolute',
    right: -REEL_SIZE * 0.52,
    top: '50%',
    marginTop: -REEL_SIZE * 0.5,
    width: REEL_SIZE,
    height: REEL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  reelImage: {
    width: REEL_SIZE * 0.95,
    height: REEL_SIZE * 0.95,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  button: {
    width: '100%',
    height: 56,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.ember,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: Fonts.medium,
    color: Colors.white,
    letterSpacing: 0.3,
  },
  termsText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  termsLink: {
    color: Colors.ink,
    textDecorationLine: 'underline',
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
