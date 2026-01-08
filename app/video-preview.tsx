import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Download, Copy, Check, RefreshCw, Mic, MicOff, Music, Music2, Subtitles } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import {
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';

export default function VideoPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ 
    videoId: string;
    videoUri: string;
    prompt: string;
    script?: string;
    projectId?: string;
    thumbnailUrl?: string;
  }>();
  
  const { addVideo } = useApp();
  
  // Parse params
  const videoId = params.videoId;
  const videoUri = params.videoUri;
  const prompt = params.prompt || '';
  const script = params.script || '';
  const projectId = params.projectId as any;
  const thumbnailUrl = params.thumbnailUrl;

  // Local state
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  // Video option toggles
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);

  // Convex hooks
  const getFreshVideoUrl = useAction(api.tasks.getFreshProjectVideoUrl);
  const getVideoVariant = useAction(api.tasks.getVideoVariant);
  const deleteProjectMutation = useMutation(api.tasks.deleteProject);
  const regenerateProjectEditing = useMutation(api.tasks.regenerateProjectEditing);

  // Video player
  const videoPlayer = useVideoPlayer(
    videoUri || null,
    (player) => {
      if (player && videoUri) {
        player.loop = true;
        player.muted = false;
        player.play();
      }
    }
  );

  const handleClose = () => {
    router.back();
  };

  const handleDownload = async () => {
    if (!videoUri || isDownloading) return;

    try {
      setIsDownloading(true);
      setDownloadSuccess(false);
      
      let downloadUrl = videoUri;
      
      // Check if user has customized the video options (not all enabled)
      const isDefaultVariant = voiceoverEnabled && musicEnabled && captionsEnabled;
      
      if (projectId) {
        if (!isDefaultVariant) {
          // User wants a custom variant - call getVideoVariant to compose it
          console.log('[download] Getting custom variant:', { voice: voiceoverEnabled, music: musicEnabled, captions: captionsEnabled });
          try {
            const variantResult = await getVideoVariant({
              projectId: projectId,
              includeVoice: voiceoverEnabled,
              includeMusic: musicEnabled,
              includeCaptions: captionsEnabled,
            });
            
            if (variantResult.success && variantResult.url) {
              downloadUrl = variantResult.url;
              console.log('[download] Got variant URL:', variantResult.cached ? '(cached)' : '(newly composed)');
            } else {
              throw new Error('Failed to get video variant');
            }
          } catch (error) {
            console.error('[download] Failed to get variant:', error);
            Alert.alert(
              'Variant Not Available', 
              'Custom video options require the video to be re-processed. This feature may not be available for older videos. Downloading the default version instead.'
            );
            // Fall back to default URL
            const freshUrl = await getFreshVideoUrl({ projectId });
            if (freshUrl) {
              downloadUrl = freshUrl;
            }
          }
        } else {
          // Default variant - just get fresh URL
          try {
            const freshUrl = await getFreshVideoUrl({ projectId });
            if (freshUrl) {
              downloadUrl = freshUrl;
              console.log('[download] Using fresh URL for download');
            }
          } catch (error) {
            console.error('[download] Failed to fetch fresh URL, using existing:', error);
          }
        }
      }

      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant permission to save videos to your library.'
        );
        return;
      }

      if (Platform.OS === 'web') {
        // Web: trigger browser download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `reelfull_${Date.now()}.mp4`;
        link.click();
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 5000);
      } else {
        // Mobile: download to local file first, then save to media library
        const fileUri = `${FileSystem.documentDirectory}reelfull_${Date.now()}.mp4`;
        
        console.log('[Download] Downloading video from:', downloadUrl);
        console.log('[Download] To local path:', fileUri);
        
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);
        
        if (downloadResult.status === 200) {
          console.log('[Download] Download complete, saving to media library...');
          const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
          await MediaLibrary.createAlbumAsync('Reelful', asset, false);
          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 5000);
        } else {
          throw new Error(`Download failed with status: ${downloadResult.status}`);
        }
      }
    } catch (error) {
      console.error('Error downloading video:', error);
      Alert.alert('Error', 'Failed to download video. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyScript = async () => {
    const textToCopy = script || prompt;
    if (!textToCopy) return;

    try {
      const transformedText = textToCopy.replace(/\?\?\?/g, '?');
      await Clipboard.setStringAsync(transformedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Copy error:', error);
      Alert.alert('Error', 'Failed to copy text. Please try again.');
    }
  };

  const handleRegenerate = async () => {
    if (!projectId || isRegenerating) return;

    setIsRegenerating(true);
    try {
      console.log('[video-preview] Regenerating project editing for:', projectId);
      
      const result = await regenerateProjectEditing({
        sourceProjectId: projectId,
      });

      if (result.success && result.newProjectId) {
        console.log('[video-preview] New project created:', result.newProjectId);
        
        const transformedScript = script?.replace(/\?\?\?/g, '?');
        addVideo({
          id: result.newProjectId,
          uri: '',
          prompt: prompt,
          script: transformedScript,
          createdAt: Date.now(),
          status: 'processing',
          projectId: result.newProjectId,
          thumbnailUrl: thumbnailUrl,
        });

        router.replace('/feed');
      } else {
        throw new Error('Failed to create regenerated project');
      }
    } catch (error) {
      console.error('[video-preview] Regenerate error:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('FREE_TIER_LIMIT_REACHED') || errorMessage.includes('NO_CREDITS_AVAILABLE')) {
        router.push('/paywall');
      } else {
        Alert.alert('Error', 'Failed to regenerate video. Please try again.');
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!videoUri) {
    return (
      <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <X size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.placeholder} />
        <View style={styles.placeholder} />
      </View>
      <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Video not available</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <X size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.placeholder} />
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.title}>Ready to share!</Text>
        </View>

        <View style={styles.videoPreviewContainer}>
          <VideoView
            player={videoPlayer}
            style={styles.videoPreview}
            contentFit="cover"
            nativeControls={true}
          />
        </View>

        <View style={styles.promptSection}>
          <TouchableOpacity
            style={styles.copyIconButton}
            onPress={handleCopyScript}
            activeOpacity={0.8}
            disabled={!script && !prompt}
          >
            {isCopied ? (
              <Check size={18} color={Colors.orange} strokeWidth={2.5} />
            ) : (
              <Copy size={18} color={Colors.white} strokeWidth={2.5} />
            )}
          </TouchableOpacity>
          <Text style={styles.promptText} numberOfLines={2} ellipsizeMode="tail">
            {script || prompt}
          </Text>
        </View>

        <View style={styles.actions}>
          {/* Video Option Toggles */}
          <View style={styles.videoOptionsRow}>
            <TouchableOpacity
              style={[
                styles.videoOptionToggle,
                voiceoverEnabled && styles.videoOptionToggleActive
              ]}
              onPress={() => setVoiceoverEnabled(!voiceoverEnabled)}
              activeOpacity={0.7}
            >
              {voiceoverEnabled ? (
                <Mic size={18} color={Colors.white} strokeWidth={2} />
              ) : (
                <MicOff size={18} color={Colors.grayLight} strokeWidth={2} />
              )}
              <Text style={[
                styles.videoOptionLabel,
                !voiceoverEnabled && styles.videoOptionLabelInactive
              ]}>Voice</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.videoOptionToggle,
                musicEnabled && styles.videoOptionToggleActive
              ]}
              onPress={() => setMusicEnabled(!musicEnabled)}
              activeOpacity={0.7}
            >
              {musicEnabled ? (
                <Music size={18} color={Colors.white} strokeWidth={2} />
              ) : (
                <Music2 size={18} color={Colors.grayLight} strokeWidth={2} />
              )}
              <Text style={[
                styles.videoOptionLabel,
                !musicEnabled && styles.videoOptionLabelInactive
              ]}>Music</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.videoOptionToggle,
                captionsEnabled && styles.videoOptionToggleActive
              ]}
              onPress={() => setCaptionsEnabled(!captionsEnabled)}
              activeOpacity={0.7}
            >
              <Subtitles size={18} color={captionsEnabled ? Colors.white : Colors.grayLight} strokeWidth={2} />
              <Text style={[
                styles.videoOptionLabel,
                !captionsEnabled && styles.videoOptionLabelInactive
              ]}>Captions</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownload}
            activeOpacity={0.8}
            disabled={isDownloading}
          >
            <LinearGradient
              colors={[Colors.orangeLight, Colors.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.downloadGradient}
            >
              {isDownloading ? (
                <>
                  <ActivityIndicator size="small" color={Colors.white} />
                  <Text style={styles.downloadButtonText}>
                    {!(voiceoverEnabled && musicEnabled && captionsEnabled) ? 'Composing...' : 'Downloading...'}
                  </Text>
                </>
              ) : (
                <>
                  <Download size={20} color={Colors.white} strokeWidth={2.5} />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleRegenerate}
            activeOpacity={0.8}
            disabled={isRegenerating}
          >
            <LinearGradient
              colors={[Colors.orangeLight, Colors.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.downloadGradient}
            >
              {isRegenerating ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <RefreshCw size={20} color={Colors.white} strokeWidth={2.5} />
                  <Text style={styles.downloadButtonText}>Regenerate</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {downloadSuccess && (
            <Text style={styles.downloadSuccessText}>
              This video was saved to your camera roll.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.black,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.regular,
    color: Colors.white,
    textAlign: 'center',
  },
  videoPreviewContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  videoPreview: {
    width: '65%',
    aspectRatio: 9 / 16,
    maxHeight: 380,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.grayDark,
  },
  promptSection: {
    marginBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  promptText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: Colors.white,
    lineHeight: 20,
    textAlign: 'center',
    paddingRight: 40,
  },
  copyIconButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  actions: {
    alignItems: 'center',
    gap: 12,
  },
  videoOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  videoOptionToggle: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: Colors.grayDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 4,
  },
  videoOptionToggleActive: {
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    borderColor: Colors.orange,
  },
  videoOptionLabel: {
    fontSize: 10,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  videoOptionLabelInactive: {
    color: Colors.grayLight,
  },
  downloadButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  downloadGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  downloadButtonText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  downloadSuccessText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.white,
    textAlign: 'center',
    opacity: 0.8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: Colors.grayLight,
  },
  errorButton: {
    backgroundColor: Colors.orange,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorButtonText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
});

