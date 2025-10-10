import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Download, Home } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

export default function ResultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prompt: string; videoData: string }>();
  const { addVideo } = useApp();
  const [isSaved, setIsSaved] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  console.log('Result screen params:', params);

  const mediaUris = useMemo(() => {
    return params.videoData ? JSON.parse(params.videoData) : [];
  }, [params.videoData]);
  
  const firstMedia = useMemo(() => mediaUris[0], [mediaUris]);
  
  const videoPlayer = useVideoPlayer(
    firstMedia?.type === 'video' && firstMedia?.uri ? firstMedia.uri : null,
    (player) => {
      if (player && firstMedia?.type === 'video') {
        player.loop = true;
        player.muted = false;
        player.play();
      }
    }
  );

  useEffect(() => {
    const handleSaveToFeed = async () => {
      if (!params.videoData || !params.prompt || isSaved) return;

      const video = {
        id: Date.now().toString(),
        uri: firstMedia?.uri || '',
        prompt: params.prompt,
        createdAt: Date.now(),
        mediaUris: mediaUris,
      };

      await addVideo(video);
      setIsSaved(true);
    };

    handleSaveToFeed();
  }, [params.videoData, params.prompt, isSaved, addVideo, firstMedia, mediaUris]);

  const handleDownload = async () => {
    if (!firstMedia?.uri || isDownloading) return;

    try {
      setIsDownloading(true);

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant media library permissions to download videos.'
        );
        return;
      }

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = firstMedia.uri;
        link.download = `reelfull_${Date.now()}.${firstMedia.type === 'video' ? 'mp4' : 'jpg'}`;
        link.click();
      } else {
        const ext = firstMedia.type === 'video' ? 'mp4' : 'jpg';
        const fileUri = `${FileSystem.documentDirectory}reelfull_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({
          from: firstMedia.uri,
          to: fileUri,
        });

        const asset = await MediaLibrary.createAssetAsync(fileUri);
        await MediaLibrary.createAlbumAsync('Reelfull', asset, false);

        Alert.alert('Success', `${firstMedia.type === 'video' ? 'Video' : 'Image'} saved to your gallery!`);
      }
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download video. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleGoHome = () => {
    router.replace('/feed');
  };

  if (!firstMedia?.uri) {
    console.error('Invalid media in result screen');
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: Colors.white, fontSize: 18 }}>Error: No media available</Text>
        <TouchableOpacity
          style={{ marginTop: 20, padding: 16, backgroundColor: Colors.orange, borderRadius: 12 }}
          onPress={() => router.replace('/feed')}
        >
          <Text style={{ color: Colors.white, fontWeight: '700' as const }}>Go to Feed</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {firstMedia.type === 'video' ? (
        <VideoView
          player={videoPlayer}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <Image
          source={{ uri: firstMedia.uri }}
          style={styles.video}
        />
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)', Colors.black]}
        style={[styles.overlay, { paddingBottom: insets.bottom + 20 }]}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Check size={32} color={Colors.orange} strokeWidth={3} />
            <Text style={styles.title}>Your reel is ready!</Text>
          </View>
          
          <View style={styles.promptWrapper}>
            <TouchableOpacity
              onPress={() => setIsPromptExpanded(!isPromptExpanded)}
              activeOpacity={0.7}
              style={styles.promptContainer}
            >
              <Text
                style={styles.subtitle}
                numberOfLines={isPromptExpanded ? undefined : 2}
              >
                {params.prompt}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleDownload}
              disabled={isDownloading}
              activeOpacity={0.8}
            >
              <Download size={24} color={Colors.white} strokeWidth={2} />
              <Text style={styles.secondaryButtonText}>
                {isDownloading ? 'Downloading...' : 'Download'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleGoHome}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.orange, Colors.orangeLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Home size={24} color={Colors.white} strokeWidth={2} />
                <Text style={styles.primaryButtonText}>
                  {isSaved ? 'Go to Feed' : 'Save & Go to Feed'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {isSaved && (
            <View style={styles.savedBadge}>
              <Check size={16} color={Colors.orange} strokeWidth={3} />
              <Text style={styles.savedText}>Saved to feed</Text>
            </View>
          )}
        </View>
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
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 100,
  },
  content: {
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  promptWrapper: {
    marginHorizontal: -24,
    marginBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 12,
  },
  promptContainer: {
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.white,
    marginTop: 16,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: Colors.grayLight,
    textAlign: 'left',
    lineHeight: 18,
    marginTop: 8,
  },
  actions: {
    gap: 12,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 18,
    borderWidth: 2,
    borderColor: Colors.grayLight,
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  primaryButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 18,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  savedText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.orange,
  },
});
