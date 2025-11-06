import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';

export default function IntroScreen() {
  const router = useRouter();
  const { userId, isLoading } = useApp();
  const [hasNavigated, setHasNavigated] = useState(false);
  
  const videoSource = require('../assets/intro-video.mp4');
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
        <Text style={styles.title}>Reelful</Text>
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
  title: {
    position: 'absolute',
    bottom: 120,
    fontSize: 50,
    fontFamily: Fonts.regular,
    color: Colors.white,
    letterSpacing: -1,
  },
});
