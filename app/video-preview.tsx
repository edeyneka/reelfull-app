import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Download, Copy, Check, RefreshCw, Mic, MicOff, Music, Music2, Subtitles, MessageSquare, Loader2 } from 'lucide-react-native';
import { useState, useEffect, useRef } from 'react';
import {
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';
import { GenerationPhase } from '@/types';

// Helper function to calculate generation phase from project data
const getGenerationPhase = (project: any): GenerationPhase => {
  if (!project) return null;
  
  // If video is completed, no phase
  if (project.status === 'completed' && project.renderedVideoUrl) {
    return null;
  }
  
  // Debug logging
  console.log('[getGenerationPhase] Project state:', {
    status: project.status,
    animationStatus: project.animationStatus,
    hasAudioUrl: !!project.audioUrl,
    hasMusicUrl: !!project.musicUrl,
    renderProgress: project.renderProgress?.step,
    hasRenderedVideoUrl: !!project.renderedVideoUrl,
  });
  
  // Priority 1: Check render progress step - if it exists, we're past media preparation
  const step = project.renderProgress?.step?.toLowerCase() || '';
  if (step) {
    console.log('[getGenerationPhase] Render step found:', step);
    if (step.includes('claude') || step.includes('editing')) {
      return 'video_agent';
    }
    if (step.includes('finaliz') || step.includes('download') || step.includes('saving')) {
      return 'finalizing';
    }
    // Any other render step (sandbox, upload, environment, render, preparing) = composing
    if (step.includes('render') || step.includes('sandbox') || step.includes('upload') || 
        step.includes('environment') || step.includes('preparing')) {
      return 'composing';
    }
  }
  
  // Priority 2: Check if still preparing media assets (FAL animations, TTS, music)
  const hasMediaAssets = project.audioUrl && project.musicUrl;
  if (project.animationStatus === 'in_progress' || !hasMediaAssets) {
    return 'preparing_media';
  }
  
  // Priority 3: If we have media assets but no render progress yet, still preparing
  // (waiting for render to start)
  if (hasMediaAssets && !project.renderProgress) {
    return 'preparing_media';
  }
  
  // Default during processing
  return 'preparing_media';
};

// Get user-friendly phase text
const getPhaseText = (phase: GenerationPhase): { title: string; subtitle: string } => {
  switch (phase) {
    case 'preparing_media':
      return { title: 'Preparing Media', subtitle: 'Creating voiceover, music, and animations...' };
    case 'video_agent':
      return { title: 'Running Video Agent', subtitle: 'AI is editing your video sequence...' };
    case 'composing':
      return { title: 'Composing', subtitle: 'Rendering your video...' };
    case 'finalizing':
      return { title: 'Finalizing', subtitle: 'Almost done! Preparing your video...' };
    default:
      return { title: 'Generating', subtitle: 'Creating your video...' };
  }
};

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
    testMode?: string;
    isGenerating?: string;
  }>();
  
  const { addVideo, updateVideoStatus } = useApp();
  
  // Parse params
  const videoId = params.videoId;
  const initialVideoUri = params.videoUri;
  const prompt = params.prompt || '';
  const script = params.script || '';
  const projectId = params.projectId as any;
  const thumbnailUrl = params.thumbnailUrl;
  const isTestMode = params.testMode === 'true';
  const isGeneratingParam = params.isGenerating === 'true';
  
  // Track current video URI (can be updated when generation completes)
  const [videoUri, setVideoUri] = useState(initialVideoUri);
  
  // Spinner animation
  const spinAnim = useRef(new Animated.Value(0)).current;
  
  // Query project status when generating
  const project = useQuery(
    api.tasks.getProject,
    projectId ? { id: projectId } : "skip"
  );
  
  // Calculate if we're still generating based on live project data
  const isGenerating = isGeneratingParam && (!project?.renderedVideoUrl || project?.status !== 'completed');
  const generationPhase = isGenerating ? getGenerationPhase(project) : null;
  const phaseText = getPhaseText(generationPhase);
  
  // Update video URI when generation completes
  useEffect(() => {
    if (project?.status === 'completed' && project?.renderedVideoUrl && isGeneratingParam) {
      console.log('[video-preview] Generation completed, updating video URI');
      setVideoUri(project.renderedVideoUrl);
      // Update the local video status
      if (videoId) {
        updateVideoStatus(videoId, 'ready', project.renderedVideoUrl, undefined, project.thumbnailUrl);
      }
    }
  }, [project?.status, project?.renderedVideoUrl, isGeneratingParam, videoId, updateVideoStatus, project?.thumbnailUrl]);
  
  // Animate spinner when generating
  useEffect(() => {
    if (isGenerating) {
      spinAnim.setValue(0);
      const animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          isInteraction: false,
        })
      );
      animation.start();
      return () => animation.stop();
    }
  }, [isGenerating, spinAnim]);
  
  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
    // In test mode, navigate directly to feed since the navigation stack may be inconsistent
    // In production, router.back() goes to feed (since video-preview is opened from feed)
    if (isTestMode) {
      router.replace('/(tabs)');
    } else {
      router.back();
    }
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
      const { status, accessPrivileges } = await MediaLibrary.requestPermissionsAsync();
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
        console.log('[Download] Access privileges:', accessPrivileges);
        
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);
        
        if (downloadResult.status === 200) {
          console.log('[Download] Download complete, saving to media library...');
          const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
          
          // Try to create album, but don't fail if it doesn't work (e.g., limited access)
          try {
            await MediaLibrary.createAlbumAsync('Reelful', asset, false);
          } catch (albumError) {
            // Album creation can fail with limited access, but the asset is still saved
            console.log('[Download] Album creation skipped (limited access):', albumError);
          }
          
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

        router.replace('/(tabs)');
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

  const handleChatHistory = () => {
    // Navigate to chat composer with this project's chat history
    if (projectId) {
      // Pause video before navigating to chat
      if (videoPlayer) {
        videoPlayer.pause();
      }
      router.push({
        pathname: '/chat-composer',
        params: { projectId, fromVideo: 'true' },
      });
    }
  };

  // Show error only if no video URI AND not generating
  if (!videoUri && !isGenerating) {
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
          testID="closeVideoPreviewButton"
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <X size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.placeholder} />
        {projectId && !isTestMode && (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={handleChatHistory}
            activeOpacity={0.7}
          >
            <MessageSquare size={22} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
        )}
        {(!projectId || isTestMode) && <View style={styles.placeholder} />}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.title}>
            {isGenerating ? phaseText.title : 'Ready to share!'}
          </Text>
          {isGenerating && (
            <Text style={styles.subtitle}>{phaseText.subtitle}</Text>
          )}
        </View>

        <View testID="videoPreviewContainer" style={styles.videoPreviewContainer}>
          {isGenerating ? (
            // Generating state - show thumbnail with spinner overlay
            <View style={styles.videoPreview}>
              {thumbnailUrl ? (
                <Image
                  source={{ uri: thumbnailUrl }}
                  style={styles.generatingThumbnail}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.generatingPlaceholder} />
              )}
              <View style={styles.generatingOverlay}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <Loader2 size={48} color={Colors.orange} strokeWidth={2} />
                </Animated.View>
                <Text style={styles.generatingPhaseText}>{phaseText.title}</Text>
              </View>
            </View>
          ) : (
            // Ready state - show video player
            <VideoView
              player={videoPlayer}
              style={styles.videoPreview}
              contentFit="cover"
              nativeControls={true}
            />
          )}
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
          {/* Video Option Toggles - disabled when generating */}
          <View style={[styles.videoOptionsRow, isGenerating && styles.disabledSection]}>
            <TouchableOpacity
              style={[
                styles.videoOptionToggle,
                voiceoverEnabled && !isGenerating && styles.videoOptionToggleActive,
                isGenerating && styles.videoOptionToggleDisabled
              ]}
              onPress={() => !isGenerating && setVoiceoverEnabled(!voiceoverEnabled)}
              activeOpacity={isGenerating ? 1 : 0.7}
              disabled={isGenerating}
            >
              {voiceoverEnabled ? (
                <Mic size={18} color={isGenerating ? Colors.grayLight : Colors.white} strokeWidth={2} />
              ) : (
                <MicOff size={18} color={Colors.grayLight} strokeWidth={2} />
              )}
              <Text style={[
                styles.videoOptionLabel,
                (!voiceoverEnabled || isGenerating) && styles.videoOptionLabelInactive
              ]}>Voice</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.videoOptionToggle,
                musicEnabled && !isGenerating && styles.videoOptionToggleActive,
                isGenerating && styles.videoOptionToggleDisabled
              ]}
              onPress={() => !isGenerating && setMusicEnabled(!musicEnabled)}
              activeOpacity={isGenerating ? 1 : 0.7}
              disabled={isGenerating}
            >
              {musicEnabled ? (
                <Music size={18} color={isGenerating ? Colors.grayLight : Colors.white} strokeWidth={2} />
              ) : (
                <Music2 size={18} color={Colors.grayLight} strokeWidth={2} />
              )}
              <Text style={[
                styles.videoOptionLabel,
                (!musicEnabled || isGenerating) && styles.videoOptionLabelInactive
              ]}>Music</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.videoOptionToggle,
                captionsEnabled && !isGenerating && styles.videoOptionToggleActive,
                isGenerating && styles.videoOptionToggleDisabled
              ]}
              onPress={() => !isGenerating && setCaptionsEnabled(!captionsEnabled)}
              activeOpacity={isGenerating ? 1 : 0.7}
              disabled={isGenerating}
            >
              <Subtitles size={18} color={(captionsEnabled && !isGenerating) ? Colors.white : Colors.grayLight} strokeWidth={2} />
              <Text style={[
                styles.videoOptionLabel,
                (!captionsEnabled || isGenerating) && styles.videoOptionLabelInactive
              ]}>Captions</Text>
            </TouchableOpacity>
          </View>

          {/* Download button - disabled when generating */}
          <TouchableOpacity
            style={[styles.downloadButton, isGenerating && styles.disabledButton]}
            onPress={handleDownload}
            activeOpacity={isGenerating ? 1 : 0.8}
            disabled={isDownloading || isGenerating}
          >
            <LinearGradient
              colors={isGenerating ? [Colors.grayDark, Colors.gray] : [Colors.orangeLight, Colors.orange]}
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
                  <Download size={20} color={isGenerating ? Colors.grayLight : Colors.white} strokeWidth={2.5} />
                  <Text style={[styles.downloadButtonText, isGenerating && styles.disabledButtonText]}>Download</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Regenerate button - disabled when generating */}
          <TouchableOpacity
            style={[styles.downloadButton, isGenerating && styles.disabledButton]}
            onPress={handleRegenerate}
            activeOpacity={isGenerating ? 1 : 0.8}
            disabled={isRegenerating || isGenerating}
          >
            <LinearGradient
              colors={isGenerating ? [Colors.grayDark, Colors.gray] : [Colors.orangeLight, Colors.orange]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.downloadGradient}
            >
              {isRegenerating ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <RefreshCw size={20} color={isGenerating ? Colors.grayLight : Colors.white} strokeWidth={2.5} />
                  <Text style={[styles.downloadButtonText, isGenerating && styles.disabledButtonText]}>Regenerate</Text>
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
  chatButton: {
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
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    textAlign: 'center',
    marginTop: 8,
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
  generatingThumbnail: {
    width: '100%',
    height: '100%',
  },
  generatingPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.grayDark,
  },
  generatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  generatingPhaseText: {
    fontSize: 14,
    fontFamily: Fonts.title,
    color: Colors.orange,
    textAlign: 'center',
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
  videoOptionToggleDisabled: {
    opacity: 0.5,
    borderColor: 'transparent',
    backgroundColor: Colors.grayDark,
  },
  disabledSection: {
    opacity: 0.6,
  },
  disabledButton: {
    opacity: 0.7,
  },
  disabledButtonText: {
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

