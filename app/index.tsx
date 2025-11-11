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
  const [showButtons, setShowButtons] = useState(false);
  
  const gifSource = require('../assets/intro-video.gif');

  // Show buttons after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowButtons(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleGetStarted = () => {
    if (hasNavigated) return;
    setHasNavigated(true);
    
    // Check if user is already logged in
    if (userId) {
      router.replace('/feed');
    } else {
      router.push('/auth');
    }
  };

  const handleLogIn = () => {
    if (hasNavigated) return;
    setHasNavigated(true);
    
    // Check if user is already logged in
    if (userId) {
      router.replace('/feed');
    } else {
      router.push('/auth');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        <Image
          source={gifSource}
          style={styles.gif}
          resizeMode="cover"
        />
      </View>
      <View style={styles.blackOverlay} />
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0)']}
        style={styles.gradient}
      >
        <Text style={styles.title}>Reelful</Text>
        
        {showButtons && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleGetStarted}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.orange, Colors.orangeLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleLogIn}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Log In</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
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
    top: -80,
    left: 0,
    right: 0,
    height: '100%',
    overflow: 'hidden',
  },
  gif: {
    width: '100%',
    height: '100%',
  },
  blackOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: Colors.black,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    position: 'absolute',
    top: '70%',
    fontSize: 50,
    fontFamily: Fonts.regular,
    color: Colors.white,
    letterSpacing: -1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 60,
    width: '100%',
    paddingHorizontal: 32,
    gap: 12,
  },
  primaryButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
});
