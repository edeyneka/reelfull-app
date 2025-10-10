import { useLocalSearchParams, useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Asset } from 'expo-asset';
import Colors from '@/constants/colors';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/backend-api';

const simulateVideoGeneration = async (
  mediaUris: { uri: string; type: 'video' | 'image' }[],
  onProgress: (progress: number) => void
): Promise<string> => {
  // Load the hardcoded intro video asset first
  const [asset] = await Asset.loadAsync(require('@/assets/video.mp4'));
  const hardcodedVideo = [{ uri: asset.localUri || asset.uri, type: 'video' as const }];

  return new Promise((resolve) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => resolve(JSON.stringify(mediaUris)), 300);
      }
      onProgress(Math.min(progress, 100));
    }, 200);
  });
};

export default function LoaderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId: string }>();
  const [progress, setProgress] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const project = useQuery(api.tasks.getProject, 
    params.projectId ? { id: params.projectId as any } : 'skip'
  );

  const completeProject = useMutation(api.tasks.completeProject);

  console.log('loader: project data:', project);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim, rotateAnim]);

  useEffect(() => {
    if (project) {
      if (project.status === 'completed' && project.videoUrl) {
        console.log('project completed, navigating to result');
        router.replace({
          pathname: '/result',
          params: { 
            prompt: project.prompt,
            videoUrl: project.videoUrl,
          },
        });
      } else if (project.status === 'failed') {
        console.error('project failed');
        router.replace('/feed');
      } else {
        const simulatedProgress = Math.min((Date.now() - project._creationTime) / 200, 100);
        setProgress(simulatedProgress);
      }
    }
  }, [project]);

  const handleSimulate = async () => {
    if (params.projectId) {
      try {
        await completeProject({ id: params.projectId as any });
      } catch (error) {
        console.error('simulate failed:', error);
      }
    }
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.black, Colors.grayDark, Colors.black]}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.iconContainer,
            {
              transform: [{ scale: pulseAnim }, { rotate }],
            },
          ]}
        >
          <Sparkles size={60} color={Colors.orange} strokeWidth={2} />
        </Animated.View>

        <Text style={styles.title}>Creating your reel</Text>
        <Text style={styles.subtitle}>This will only take a moment...</Text>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <LinearGradient
              colors={[Colors.orange, Colors.orangeLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${progress}%` }]}
            />
          </View>
          <Text style={styles.progressText}>{Math.round(progress)}%</Text>
        </View>

        <TouchableOpacity
          style={styles.simulateButton}
          onPress={handleSimulate}
          activeOpacity={0.5}
        >
          <Text style={styles.simulateText}>simulate</Text>
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconContainer: {
    marginBottom: 32,
    padding: 24,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.grayLight,
    marginBottom: 48,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: Colors.gray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.orange,
  },
  simulateButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    opacity: 0.3,
  },
  simulateText: {
    fontSize: 10,
    color: Colors.grayLight,
    fontWeight: '400' as const,
  },
});
