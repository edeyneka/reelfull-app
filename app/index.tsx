import { useRouter } from 'expo-router';
import { Film, ArrowRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';

export default function IntroScreen() {
  const router = useRouter();
  const { userId, isLoading } = useApp();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const [hasNavigated, setHasNavigated] = useState(false);
  
  const videoSource = require('../assets/intro-video.mov');
  const player = useVideoPlayer(videoSource, (player) => {
    player.loop = false; // Play video only once
    player.muted = true;
    player.play();
  });

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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  // Listen for video ending and automatically navigate when it's done
  useEffect(() => {
    if (!isLoading && player) {
      const checkStatus = setInterval(() => {
        // Check if video has finished: status is 'idle' and we've played through the video
        const duration = player.duration || 0;
        const currentTime = player.currentTime || 0;
        
        // Video is considered finished when we're at or very near the end
        if (duration > 0 && currentTime > 0 && (currentTime >= duration - 0.1 || player.status === 'idle')) {
          console.log('Video finished, auto-navigating...', { duration, currentTime, status: player.status });
          navigateToNextScreen();
          clearInterval(checkStatus);
        }
      }, 100);

      return () => clearInterval(checkStatus);
    }
  }, [isLoading, userId, player, navigateToNextScreen]);

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.8)']}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <Film size={80} color={Colors.orange} strokeWidth={2} />
          </View>
          <Text style={styles.title}>Reelful</Text>
          <Text style={styles.subtitle}>Live life to the fullest</Text>
        </Animated.View>

        {/* Skip Intro Button at the bottom */}
        {!isLoading && (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={navigateToNextScreen}
            activeOpacity={0.8}
          >
            <Text style={styles.skipText}>Skip intro</Text>
            <ArrowRight size={20} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
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
  video: {
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
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
    padding: 20,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  title: {
    fontSize: 56,
    fontFamily: Fonts.title,
    color: Colors.white,
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: Fonts.regular,
    color: Colors.orange,
    letterSpacing: 1,
  },
  skipButton: {
    position: 'absolute',
    bottom: 220,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  skipText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.white,
    letterSpacing: 0.5,
  },
});
