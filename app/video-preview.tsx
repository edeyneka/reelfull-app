import { useLocalSearchParams, useRouter } from 'expo-router';
import { X, Download, Mic, Music, Subtitles, MessageSquare, Loader2, Play, Pause } from 'lucide-react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Alert,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  Animated,
  Image,
  Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Fonts } from '@/constants/typography';
import { GenerationPhase } from '@/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Icon shadow style for visibility on light/dark videos
const ICON_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.6,
  shadowRadius: 4,
  elevation: 8,
};

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

// Icon button wrapper with shadow for visibility on any video background
const IconButton = ({ 
  onPress, 
  children, 
  style,
  disabled,
  testID,
}: { 
  onPress: () => void; 
  children: React.ReactNode;
  style?: any;
  disabled?: boolean;
  testID?: string;
}) => (
  <TouchableOpacity
    testID={testID}
    style={[styles.iconButton, ICON_SHADOW, style]}
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
  >
    {children}
  </TouchableOpacity>
);

// Sidebar icon button for right side controls (no background, just shadow like top icons)
const SidebarButton = ({ 
  onPress, 
  children, 
  disabled,
}: { 
  onPress: () => void; 
  children: React.ReactNode;
  disabled?: boolean;
}) => (
  <TouchableOpacity
    style={[styles.sidebarButton, ICON_SHADOW]}
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
  >
    {children}
  </TouchableOpacity>
);

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
  
  const { updateVideoStatus } = useApp();
  
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
  
  // Toast animation
  const toastOpacity = useRef(new Animated.Value(0)).current;
  
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
  
  // Video playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Video option toggles
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);

  // Convex hooks
  const getFreshVideoUrl = useAction(api.tasks.getFreshProjectVideoUrl);
  const getVideoVariant = useAction(api.tasks.getVideoVariant);

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
  
  // Subscribe to player status changes
  const { isPlaying: playerIsPlaying } = useEvent(videoPlayer, 'playingChange', { isPlaying: videoPlayer.playing });
  
  // Update local isPlaying state when player state changes
  useEffect(() => {
    setIsPlaying(playerIsPlaying);
  }, [playerIsPlaying]);
  
  // Track video progress
  useEffect(() => {
    if (!videoPlayer || isGenerating) return;
    
    const interval = setInterval(() => {
      if (videoPlayer.duration > 0) {
        setDuration(videoPlayer.duration);
        setProgress(videoPlayer.currentTime / videoPlayer.duration);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [videoPlayer, isGenerating]);
  
  // Auto-hide controls after 3 seconds
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);
  
  // Handle tap on video
  const handleVideoTap = useCallback(() => {
    if (isGenerating) return;
    
    // Toggle play/pause
    if (videoPlayer) {
      if (isPlaying) {
        videoPlayer.pause();
      } else {
        videoPlayer.play();
      }
    }
    
    // Show controls and reset timeout
    setShowControls(true);
    resetControlsTimeout();
  }, [videoPlayer, isPlaying, isGenerating, resetControlsTimeout]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Animate toast when download succeeds
  useEffect(() => {
    if (downloadSuccess) {
      // Fade in
      Animated.sequence([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2500),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setDownloadSuccess(false);
      });
    }
  }, [downloadSuccess, toastOpacity]);

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
        {/* Top controls */}
        <View style={[styles.topControls, { paddingTop: insets.top + 16 }]}>
          <IconButton onPress={handleClose}>
            <X size={28} color={Colors.white} strokeWidth={2.5} />
          </IconButton>
          <View style={styles.topControlsRight} />
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
      {/* Full-screen video or generating state */}
      {isGenerating ? (
        // Generating state - show thumbnail with spinner overlay
        <View style={styles.fullscreenVideo}>
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
              <Loader2 size={48} color={Colors.ember} strokeWidth={2} />
            </Animated.View>
            <Text style={styles.generatingPhaseText}>{phaseText.title}</Text>
            <Text style={styles.generatingSubtitleText}>{phaseText.subtitle}</Text>
          </View>
        </View>
      ) : (
        // Ready state - show full-screen video player with tap-to-pause
        <TouchableWithoutFeedback onPress={handleVideoTap}>
          <View style={styles.fullscreenVideo}>
            <VideoView
              player={videoPlayer}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
            
            {/* Play/Pause indicator overlay - shows briefly when toggling */}
            {showControls && (
              <View style={styles.playPauseOverlay}>
                <View style={styles.playPauseIcon}>
                  {isPlaying ? (
                    <Pause size={48} color={Colors.white} strokeWidth={2} fill={Colors.white} />
                  ) : (
                    <Play size={48} color={Colors.white} strokeWidth={2} fill={Colors.white} />
                  )}
                </View>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      )}
      
      {/* Top controls overlay */}
      <View style={[styles.topControls, { paddingTop: insets.top + 16 }]}>
        <IconButton 
          testID="closeVideoPreviewButton"
          onPress={handleClose}
        >
          <X size={28} color={Colors.white} strokeWidth={2.5} />
        </IconButton>
        
        <View style={styles.topControlsRight}>
          {projectId && !isTestMode && (
            <IconButton onPress={handleChatHistory}>
              <MessageSquare size={26} color={Colors.white} strokeWidth={2} />
            </IconButton>
          )}
        </View>
      </View>
      
      {/* Right sidebar controls - hidden during generation */}
      {!isGenerating && (
        <View style={[styles.rightSidebar, { bottom: insets.bottom + 120 }]}>
          {/* Download button */}
          <SidebarButton 
            onPress={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Download size={26} color={Colors.white} strokeWidth={2} />
            )}
          </SidebarButton>
          
          {/* Voice toggle */}
          <SidebarButton 
            onPress={() => setVoiceoverEnabled(!voiceoverEnabled)}
          >
            <Mic 
              size={26} 
              color={voiceoverEnabled ? Colors.white : "rgba(255,255,255,0.5)"} 
              strokeWidth={2} 
            />
          </SidebarButton>
          
          {/* Music toggle */}
          <SidebarButton 
            onPress={() => setMusicEnabled(!musicEnabled)}
          >
            <Music 
              size={26} 
              color={musicEnabled ? Colors.white : "rgba(255,255,255,0.5)"} 
              strokeWidth={2} 
            />
          </SidebarButton>
          
          {/* Captions toggle */}
          <SidebarButton 
            onPress={() => setCaptionsEnabled(!captionsEnabled)}
          >
            <Subtitles 
              size={26} 
              color={captionsEnabled ? Colors.white : "rgba(255,255,255,0.5)"} 
              strokeWidth={2} 
            />
          </SidebarButton>
        </View>
      )}
      
      {/* Video timeline progress bar - shows when controls are visible */}
      {!isGenerating && showControls && (
        <View style={[styles.timelineContainer, { bottom: insets.bottom + 40 }]}>
          <View style={styles.timelineTrack}>
            <View style={[styles.timelineProgress, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      )}
      
      {/* Download success toast */}
      <Animated.View 
        style={[
          styles.toast, 
          { 
            opacity: toastOpacity,
            top: insets.top + 60,
          }
        ]}
        pointerEvents="none"
      >
        <BlurView intensity={40} tint="dark" style={styles.toastBlur}>
          <Text style={styles.toastText}>This video was saved to camera roll</Text>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  fullscreenVideo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topControlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
  },
  rightSidebar: {
    position: 'absolute',
    right: 12,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  sidebarButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  playPauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
  },
  timelineTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  timelineProgress: {
    height: '100%',
    backgroundColor: Colors.white,
    borderRadius: 1.5,
  },
  generatingThumbnail: {
    width: '100%',
    height: '100%',
  },
  generatingPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.dark,
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
    fontSize: 18,
    fontFamily: Fonts.medium,
    color: Colors.ember,
    textAlign: 'center',
  },
  generatingSubtitleText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 20,
  },
  toastBlur: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  toastText: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.white,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  errorButton: {
    backgroundColor: Colors.ember,
    borderRadius: 100,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  errorButtonText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: Colors.white,
  },
});
