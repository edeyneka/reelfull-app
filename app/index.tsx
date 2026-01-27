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
  Image,
  Easing,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  const spotlightOpacity = useRef(new Animated.Value(0)).current;
  const spotlightPosition = useRef(new Animated.ValueXY({ x: 0, y: SCREEN_HEIGHT * 0.3 })).current;

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

  // Animate spotlight blob randomly
  useEffect(() => {
    const animateSpotlight = () => {
      // Random position in left portion of screen
      const randomX = Math.random() * SCREEN_WIDTH * 0.4 - SCREEN_WIDTH * 0.1;
      const randomY = Math.random() * SCREEN_HEIGHT * 0.5 + SCREEN_HEIGHT * 0.1;

      // Fade in and move
      Animated.parallel([
        Animated.timing(spotlightOpacity, {
          toValue: 0.6,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(spotlightPosition, {
          toValue: { x: randomX, y: randomY },
          duration: 1500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Hold for a moment then fade out
        setTimeout(() => {
          Animated.timing(spotlightOpacity, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }).start(() => {
            // Repeat after delay
            setTimeout(animateSpotlight, 1000 + Math.random() * 2000);
          });
        }, 2000 + Math.random() * 2000);
      });
    };

    const timeout = setTimeout(animateSpotlight, 1000);
    return () => clearTimeout(timeout);
  }, [spotlightOpacity, spotlightPosition]);

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
      {/* Ambient glow on right side - subtle warm glow near reel */}
      <View style={styles.ambientGlow}>
        <LinearGradient
          colors={['rgba(255, 200, 150, 0.08)', 'rgba(255, 180, 130, 0.04)', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 1, y: 0.5 }}
          end={{ x: 0, y: 0.5 }}
        />
      </View>

      {/* Animated spotlight blob - soft cinema light effect */}
      <Animated.View
        style={[
          styles.spotlightBlob,
          {
            opacity: spotlightOpacity,
            transform: [
              { translateX: spotlightPosition.x },
              { translateY: spotlightPosition.y },
            ],
          },
        ]}
      >
        {/* Layered circles to simulate blur - outermost (largest, most transparent) */}
        <View style={styles.spotlightLayer1} />
        <View style={styles.spotlightLayer2} />
        <View style={styles.spotlightLayer3} />
        <View style={styles.spotlightCore} />
      </Animated.View>

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
          source={require('../assets/images/white-reel.png')}
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
          {/* Get Started button with 3D pillowy effect */}
          <TouchableOpacity
            style={styles.buttonWrapper}
            onPress={() => {
              setHasNavigated(true);
              router.replace('/auth');
            }}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[Colors.creamLight, Colors.cream, Colors.creamMedium, Colors.creamDark]}
              locations={[0, 0.3, 0.7, 1]}
              style={styles.button}
            >
              {/* Top highlight for dome effect */}
              <View style={styles.buttonHighlight} />
              <Text style={styles.buttonText}>Get Started</Text>
            </LinearGradient>
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
          <ActivityIndicator size="large" color={Colors.cream} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  ambientGlow: {
    position: 'absolute',
    right: 0,
    top: '30%',
    width: 200,
    height: 400,
    overflow: 'hidden',
  },
  spotlightBlob: {
    position: 'absolute',
    width: 250,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Layered circles to create soft blur effect (largest to smallest)
  spotlightLayer1: {
    position: 'absolute',
    width: 250,
    height: 180,
    borderRadius: 125,
    backgroundColor: 'rgba(255, 235, 210, 0.07)',
  },
  spotlightLayer2: {
    position: 'absolute',
    width: 180,
    height: 130,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 245, 230, 0.12)',
  },
  spotlightLayer3: {
    position: 'absolute',
    width: 120,
    height: 85,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 250, 242, 0.18)',
  },
  spotlightCore: {
    position: 'absolute',
    width: 60,
    height: 45,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 252, 248, 0.35)',
  },
  titleContainer: {
    position: 'absolute',
    left: 32,
    zIndex: 10,
  },
  title: {
    fontSize: 50,
    fontFamily: Fonts.medium,
    color: Colors.cream,
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
  buttonWrapper: {
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  button: {
    height: 64,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  buttonHighlight: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 100,
    transform: [{ scaleY: 0.6 }],
  },
  buttonText: {
    fontSize: 18,
    fontFamily: Fonts.medium,
    color: 'rgba(0, 0, 0, 0.85)',
    letterSpacing: 0.3,
  },
  termsText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.textSecondaryDark,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  termsLink: {
    color: Colors.textSecondaryDark,
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
