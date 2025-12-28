import { useRouter } from 'expo-router';
import { Plus, Download, Settings, Loader2, AlertCircle, X, Trash2, FileText, Copy, Check, Zap, RefreshCw, Mic, MicOff, Music, Music2, Subtitles } from 'lucide-react-native';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Animated,
  ActivityIndicator,
  Platform,
  Image,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';
import { useApp } from '@/contexts/AppContext';
import { usePaywall } from '@/contexts/PaywallContext';
import { Video as VideoType } from '@/types';
import { useVideoPolling, registerForPushNotificationsAsync } from '@/lib/videoPollingService';
import { Fonts } from '@/constants/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SPACING = 8;
const ITEM_WIDTH = (SCREEN_WIDTH - ITEM_SPACING * 4) / 3;

function VideoThumbnail({ 
  item, 
  onPress, 
  onLongPress,
  isSelected
}: { 
  item: VideoType; 
  onPress: () => void;
  onLongPress: (event: any) => void;
  isSelected: boolean;
}) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const thumbnailRef = useRef<View>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Check if thumbnailUrl is actually an image (not a video)
  const isImageUrl = (url?: string) => {
    if (!url) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    const lowerUrl = url.toLowerCase();
    
    // If it has a video extension, it's not a valid thumbnail
    if (videoExtensions.some(ext => lowerUrl.includes(ext))) {
      return false;
    }
    
    // Convex storage URLs don't have extensions, but they're used for thumbnails
    // Pattern: https://*.convex.cloud/api/storage/*
    if (lowerUrl.includes('convex.cloud/api/storage/')) {
      return true;
    }
    
    // Check if it has an image extension
    return imageExtensions.some(ext => lowerUrl.includes(ext));
  };

  // Use image thumbnail if available, otherwise fall back to video
  const effectiveThumbnailUrl = isImageUrl(item.thumbnailUrl) ? item.thumbnailUrl : undefined;
  const shouldUseVideoPreview = !effectiveThumbnailUrl && item.uri && item.status === 'ready';

  // Create video player for fallback (only if needed)
  const thumbnailPlayer = useVideoPlayer(
    shouldUseVideoPreview ? item.uri : null,
    (player) => {
      if (player && shouldUseVideoPreview) {
        player.muted = true;
        // Don't autoplay thumbnails
      }
    }
  );

  // Debug: Log thumbnail URL
  useEffect(() => {
    const urlType = item.thumbnailUrl 
      ? (isImageUrl(item.thumbnailUrl) ? 'image' : 'video/other') 
      : 'missing';
    const displayText = item.script || item.prompt;
    console.log(`[Thumbnail] ${displayText}: status=${item.status}, thumbnailUrl=${urlType}, using=${effectiveThumbnailUrl ? 'image' : (shouldUseVideoPreview ? 'video' : 'placeholder')}`);
  }, [item.thumbnailUrl, item.status, item.script, item.prompt, effectiveThumbnailUrl, shouldUseVideoPreview]);

  const handleLongPress = (event: any) => {
    if (thumbnailRef.current) {
      thumbnailRef.current.measure((x, y, width, height, pageX, pageY) => {
        onLongPress({ pageX, pageY, width, height });
      });
    }
  };

  // Scale up when selected
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isSelected ? 1.05 : 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [isSelected, scaleAnim]);

  // Optimized spinner animation with proper cleanup
  useEffect(() => {
    if (item.status === 'pending' || item.status === 'processing') {
      // Reset animation value
      spinAnim.setValue(0);
      
      // Start the loop animation
      const animation = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
          isInteraction: false, // Don't block interactions
        })
      );
      
      animation.start();
      
      // Stop animation on cleanup
      return () => {
        animation.stop();
      };
    }
  }, [item.status, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Show draft icon for draft videos (not yet approved)
  if (item.status === 'draft') {
    return (
      <Animated.View 
        ref={thumbnailRef} 
        style={[
          styles.thumbnailContainer,
          { 
            transform: [{ scale: scaleAnim }],
            zIndex: isSelected ? 1000 : 1,
          }
        ]} 
        collapsable={false}
      >
        <TouchableOpacity 
          style={styles.thumbnailTouchable}
          onPress={onPress}
          onLongPress={handleLongPress}
          activeOpacity={0.9}
          delayLongPress={500}
        >
          {/* Show thumbnail in background if available */}
          {effectiveThumbnailUrl ? (
            <>
              <Image
                source={{ uri: effectiveThumbnailUrl }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.draftOverlay}>
                <FileText size={36} color={Colors.white} strokeWidth={2} />
                <Text style={styles.draftText}>Draft</Text>
              </View>
            </>
          ) : (
            <View style={styles.draftThumbnail}>
              <FileText size={36} color={Colors.white} strokeWidth={2} />
              <Text style={styles.draftText}>Draft</Text>
            </View>
          )}
          <View style={styles.thumbnailOverlay}>
            <Text style={styles.thumbnailPrompt} numberOfLines={1} ellipsizeMode="tail">
              {item.script || item.prompt}
            </Text>
          </View>
        </TouchableOpacity>
        {isSelected && <View style={styles.selectedBorder} />}
      </Animated.View>
    );
  }

  // Show placeholder for pending/processing videos
  if (item.status === 'pending' || item.status === 'processing') {
    return (
      <Animated.View 
        ref={thumbnailRef} 
        style={[
          styles.thumbnailContainer,
          { 
            transform: [{ scale: scaleAnim }],
            zIndex: isSelected ? 1000 : 1,
          }
        ]} 
        collapsable={false}
      >
        <TouchableOpacity 
          style={styles.thumbnailTouchable}
          onLongPress={handleLongPress}
          activeOpacity={0.9}
          delayLongPress={500}
        >
          {/* Show thumbnail in background if available */}
          {effectiveThumbnailUrl ? (
            <>
              <Image
                source={{ uri: effectiveThumbnailUrl }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.processingOverlay}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <Loader2 size={40} color={Colors.orange} strokeWidth={2} />
                </Animated.View>
                <Text style={styles.processingText}>
                  {item.status === 'pending' ? 'Queued...' : 'Generating...'}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.processingThumbnail}>
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <Loader2 size={40} color={Colors.orange} strokeWidth={2} />
              </Animated.View>
              <Text style={styles.processingText}>
                {item.status === 'pending' ? 'Queued...' : 'Generating...'}
              </Text>
            </View>
          )}
        <View style={styles.thumbnailOverlay}>
          <Text style={styles.thumbnailPrompt} numberOfLines={1} ellipsizeMode="tail">
            {item.prompt}
          </Text>
        </View>
      </TouchableOpacity>
      {isSelected && <View style={styles.selectedBorder} />}
    </Animated.View>
  );
}

// Show error state for failed videos
if (item.status === 'failed') {
  return (
    <Animated.View 
      ref={thumbnailRef} 
      style={[
        styles.thumbnailContainer,
        { 
          transform: [{ scale: scaleAnim }],
          zIndex: isSelected ? 1000 : 1,
        }
      ]} 
      collapsable={false}
    >
      <TouchableOpacity
        style={styles.thumbnailTouchable}
        onPress={() => Alert.alert('Generation Failed', item.error || 'Video generation failed. Please try again.')}
        onLongPress={handleLongPress}
        activeOpacity={0.9}
        delayLongPress={500}
      >
        {/* Show thumbnail in background if available */}
        {effectiveThumbnailUrl ? (
          <>
            <Image
              source={{ uri: effectiveThumbnailUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <View style={styles.errorOverlay}>
              <AlertCircle size={32} color={Colors.white} strokeWidth={2} />
              <Text style={styles.errorText}>Failed</Text>
            </View>
          </>
        ) : (
          <View style={styles.errorThumbnail}>
            <AlertCircle size={32} color={Colors.white} strokeWidth={2} />
            <Text style={styles.errorText}>Failed</Text>
          </View>
        )}
        <View style={styles.thumbnailOverlay}>
          <Text style={styles.thumbnailPrompt} numberOfLines={1} ellipsizeMode="tail">
            {item.prompt}
          </Text>
        </View>
      </TouchableOpacity>
      {isSelected && <View style={styles.selectedBorder} />}
    </Animated.View>
  );
}

// Show thumbnail image for ready videos (or placeholder if no thumbnail)
return (
  <Animated.View 
    ref={thumbnailRef} 
    style={[
      styles.thumbnailContainer,
      { 
        transform: [{ scale: scaleAnim }],
        zIndex: isSelected ? 1000 : 1,
      }
    ]} 
    collapsable={false}
  >
    <TouchableOpacity
      style={styles.thumbnailTouchable}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.9}
      delayLongPress={500}
    >
      {effectiveThumbnailUrl ? (
        <Image
          source={{ uri: effectiveThumbnailUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : shouldUseVideoPreview ? (
        <VideoView
          player={thumbnailPlayer}
          style={styles.thumbnail}
          contentFit="cover"
          nativeControls={false}
        />
      ) : (
        <View style={styles.noThumbnailContainer}>
          <Text style={styles.noThumbnailText}>No Thumbnail</Text>
        </View>
      )}
      <View style={styles.thumbnailOverlay}>
        <Text style={styles.thumbnailPrompt} numberOfLines={1} ellipsizeMode="tail">
          {item.prompt}
        </Text>
      </View>
      </TouchableOpacity>
      {isSelected && <View style={styles.selectedBorder} />}
    </Animated.View>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { videos, deleteVideo, addVideo, userId, syncedFromBackend, syncVideosFromBackend, syncUserFromBackend } = useApp();
  const { subscriptionState, hasCompletedPaywallThisSession } = usePaywall();
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [hasShownInitialPaywall, setHasShownInitialPaywall] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [actionSheetVideo, setActionSheetVideo] = useState<VideoType | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetPosition, setActionSheetPosition] = useState({ pageX: 0, pageY: 0, width: 0, height: 0, columnIndex: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Video option toggles
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  
  // Check if there are any pending/processing videos that need fresh data
  const hasPendingVideos = useMemo(() => 
    videos.some(v => v.status === 'pending' || v.status === 'processing'),
    [videos]
  );
  
  // Fetch current user profile from backend
  const backendUser = useQuery(
    api.users.getCurrentUser,
    userId ? { userId } : "skip"
  );
  
  // Query projects normally (no fresh URL generation upfront)
  const backendProjects = useQuery(
    api.tasks.getProjects,
    ((!syncedFromBackend || isRefreshing || hasPendingVideos) && userId) ? { userId } : "skip"
  );
  
  // Convex mutation for deleting projects
  const deleteProjectMutation = useMutation(api.tasks.deleteProject);
  
  // Convex mutation for regenerating project editing
  const regenerateProjectEditing = useMutation(api.tasks.regenerateProjectEditing);
  
  // Action to get fresh video URL on-demand (when user taps to view)
  const getFreshVideoUrl = useAction(api.tasks.getFreshProjectVideoUrl);
  
  // Action to get video variant with specific options
  const getVideoVariant = useAction(api.tasks.getVideoVariant);
  
  // Query video generation status (total count including deleted videos)
  const videoGenerationStatus = useQuery(
    api.users.getVideoGenerationStatus,
    userId ? { userId } : "skip"
  );

  // Sync user profile from backend when loaded
  useEffect(() => {
    if (backendUser && userId) {
      console.log('[feed] Syncing user profile from backend');
      syncUserFromBackend(backendUser);
    }
  }, [backendUser, userId, syncUserFromBackend]);

  // Sync videos from backend when projects are loaded
  useEffect(() => {
    if (backendProjects && userId) {
      if (!syncedFromBackend) {
        console.log('[feed] Initial sync: Backend projects loaded, syncing...');
        syncVideosFromBackend(backendProjects);
      } else if (isRefreshing) {
        console.log('[feed] Refresh: Backend projects loaded, syncing...');
        syncVideosFromBackend(backendProjects);
        setIsRefreshing(false);
      } else if (hasPendingVideos) {
        console.log('[feed] Pending videos detected, syncing for fresh data...');
        syncVideosFromBackend(backendProjects);
      }
    }
  }, [backendProjects, syncedFromBackend, userId, syncVideosFromBackend, isRefreshing, hasPendingVideos]);

  // Organize videos into rows of 3 for proper snake fill
  // Sort videos by creation time (most recent first)
  const videoRows = useMemo(() => {
    const sortedVideos = [...videos].sort((a, b) => b.createdAt - a.createdAt);
    const rows: VideoType[][] = [];
    for (let i = 0; i < sortedVideos.length; i += 3) {
      rows.push(sortedVideos.slice(i, i + 3));
    }
    return rows;
  }, [videos]);

  // Handle pull-to-refresh
  const handleRefresh = useCallback(() => {
    console.log('[feed] User initiated refresh');
    setIsRefreshing(true);
  }, []);
  
  // Enable video polling for pending videos
  useVideoPolling();

  // Request notification permissions on mount
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // In test mode, show paywall on first access if not completed this session
  useEffect(() => {
    if (ENABLE_TEST_RUN_MODE && !hasCompletedPaywallThisSession && !hasShownInitialPaywall) {
      console.log('[feed] Test mode: showing initial paywall');
      setHasShownInitialPaywall(true);
      // Small delay to ensure the feed is rendered first
      setTimeout(() => {
        router.push('/paywall');
      }, 100);
    }
  }, [hasCompletedPaywallThisSession, hasShownInitialPaywall, router]);

  // Handle create new video - check limit before allowing
  const handleCreateNew = useCallback(() => {
    const generatedCount = videoGenerationStatus?.generatedCount ?? 0;
    const limit = videoGenerationStatus?.limit ?? 3;
    
    // In test mode, check if user has completed paywall this session
    // Otherwise, check the actual limit
    const hasReachedLimit = ENABLE_TEST_RUN_MODE 
      ? generatedCount >= limit 
      : (videoGenerationStatus?.hasReachedLimit ?? false);
    
    // In test mode, use session completion flag instead of isPro
    const hasAccess = ENABLE_TEST_RUN_MODE 
      ? hasCompletedPaywallThisSession 
      : subscriptionState.isPro;
    
    console.log('[feed] Create new pressed:', {
      generatedCount,
      limit,
      hasReachedLimit,
      isSubscribed: subscriptionState.isPro,
      hasCompletedPaywallThisSession,
      hasAccess,
      testMode: ENABLE_TEST_RUN_MODE,
    });
    
    // If user has reached limit and doesn't have access, show paywall
    if (hasReachedLimit && !hasAccess) {
      console.log(`[feed] Showing paywall - user has generated ${generatedCount}/${limit} videos (limit reached)`);
      router.push('/paywall');
      return;
    }
    
    // Otherwise, proceed to composer
    router.push('/composer');
  }, [videoGenerationStatus, subscriptionState.isPro, hasCompletedPaywallThisSession, router]);
  
  const modalPlayer = useVideoPlayer(
    selectedVideo?.uri && selectedVideo?.status === 'ready' ? selectedVideo.uri : null,
    (player) => {
      if (player && selectedVideo && selectedVideo.uri) {
        player.loop = true;
        player.muted = false;
        player.play();
      }
    }
  );

  // Animated values for slide gesture
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  
  // Animated values for action sheet
  const actionSheetBackdropOpacity = useRef(new Animated.Value(0)).current;

  // Animate modal in when video is selected
  useEffect(() => {
    if (selectedVideo) {
      // Start from below screen
      translateY.setValue(600);
      backdropOpacity.setValue(0);
      
      // Animate in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [selectedVideo, translateY, backdropOpacity]);

  // Animate action sheet in when shown
  useEffect(() => {
    if (showActionSheet) {
      actionSheetBackdropOpacity.setValue(0);
      
      // Animate in
      Animated.timing(actionSheetBackdropOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [showActionSheet, actionSheetBackdropOpacity]);

  const closeModal = () => {
    // Animate out before closing
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 600,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedVideo(null);
      translateY.setValue(0);
      backdropOpacity.setValue(0);
      setDownloadSuccess(false);
    });
  };

  const closeActionSheet = () => {
    // Animate out before closing
    Animated.timing(actionSheetBackdropOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowActionSheet(false);
      setActionSheetVideo(null);
      actionSheetBackdropOpacity.setValue(0);
    });
  };

  // Slide down gesture to close modal
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow downward drag
      if (event.translationY > 0) {
        translateY.setValue(event.translationY);
        // Gradually fade out backdrop as user drags down
        backdropOpacity.setValue(Math.max(0.3, 1 - event.translationY / 600));
      }
    })
    .onEnd((event) => {
      // If swiped down far enough or with velocity, close modal
      if (event.translationY > 150 || event.velocityY > 500) {
        // Fast animate out before closing
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 600,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setSelectedVideo(null);
          translateY.setValue(0);
          backdropOpacity.setValue(0);
          setDownloadSuccess(false);
        });
      } else {
        // Quickly spring back to original position
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }),
          Animated.spring(backdropOpacity, {
            toValue: 1,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }),
        ]).start();
      }
    });

  const handleDeleteFromGallery = async (video: VideoType) => {
    Alert.alert(
      'Delete Video',
      'Are you sure you want to delete this video?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from backend database first (if it has a projectId)
              if (video.projectId) {
                await deleteProjectMutation({ id: video.projectId as any });
              }
              
              // Then delete from local state
              deleteVideo(video.id);
            } catch (error) {
              console.error('Error deleting video:', error);
              Alert.alert('Error', 'Failed to delete video. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderVideoThumbnail = (item: VideoType, globalIndex: number, columnIndex: number) => {
    return (
      <VideoThumbnail 
        key={item.id}
        item={item} 
        isSelected={actionSheetVideo?.id === item.id}
        onPress={async () => {
          // Navigate to script-review for draft videos
          if (item.status === 'draft' && item.projectId) {
            router.push({
              pathname: '/script-review',
              params: { projectId: item.projectId },
            });
          }
          // Only allow opening ready videos with valid URIs
          else if (item.status === 'ready' && item.uri && item.uri.length > 0) {
            // Fetch fresh URL on-demand before opening
            if (item.projectId) {
              console.log('[feed] Fetching fresh URL for video...');
              try {
                const freshUrl = await getFreshVideoUrl({ projectId: item.projectId as any });
                if (freshUrl) {
                  console.log('[feed] ✓ Got fresh URL');
                  // Update the video with fresh URL before opening
                  setSelectedVideo({ ...item, uri: freshUrl });
                } else {
                  // Use existing URL if fresh fetch failed
                  setSelectedVideo(item);
                }
              } catch (error) {
                console.error('[feed] Failed to fetch fresh URL:', error);
                // Use existing URL as fallback
                setSelectedVideo(item);
              }
            } else {
              setSelectedVideo(item);
            }
          } else if (item.status === 'ready' && (!item.uri || item.uri.length === 0)) {
            Alert.alert('Error', 'Video is not available. Please try again or contact support.');
          } else if (item.status === 'pending' || item.status === 'processing') {
            Alert.alert('Video Processing', 'Your video is still being generated. You\'ll receive a notification when it\'s ready!');
          }
        }}
        onLongPress={(position) => {
          setActionSheetVideo(item);
          setActionSheetPosition({ ...position, columnIndex });
          setShowActionSheet(true);
        }}
      />
    );
  };

  const renderRow = ({ item: row, index: rowIndex }: { item: VideoType[]; index: number }) => {
    return (
      <View style={styles.row}>
        {row.map((video, colIndex) => renderVideoThumbnail(video, rowIndex * 3 + colIndex, colIndex))}
        {/* Add empty spacers for incomplete rows to maintain layout */}
        {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
          <View key={`spacer-${rowIndex}-${i}`} style={{ width: ITEM_WIDTH }} />
        ))}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>Start a project!</Text>
      <Text style={styles.emptySubtitle}>
        Upload your photos and videos and let the magic begin!
      </Text>
      <TouchableOpacity
        style={styles.startCreatingButton}
        onPress={handleCreateNew}
        activeOpacity={0.8}
      >
        <Text style={styles.startCreatingText}>Start Creating</Text>
      </TouchableOpacity>
    </View>
  );

  const handleDelete = async () => {
    if (!selectedVideo) return;

    try {
      // Delete from backend database first (if it has a projectId)
      if (selectedVideo.projectId) {
        await deleteProjectMutation({ id: selectedVideo.projectId as any });
      }
      
      // Then delete from local state (will trigger grid remount via useEffect)
      deleteVideo(selectedVideo.id);
      
      closeModal();
    } catch (error) {
      console.error('Error deleting video:', error);
      Alert.alert('Error', 'Failed to delete video. Please try again.');
    }
  };

  const handleDownload = async () => {
    if (!selectedVideo || isDownloading) return;

    // Validate video URI
    if (!selectedVideo.uri || selectedVideo.uri.length === 0) {
      Alert.alert('Error', 'Video is not available for download.');
      return;
    }

    if (selectedVideo.status !== 'ready') {
      Alert.alert('Error', 'Please wait until the video is ready before downloading.');
      return;
    }

    try {
      setIsDownloading(true);
      
      let downloadUrl = selectedVideo.uri;
      
      // Check if user has customized the video options (not all enabled)
      const isDefaultVariant = voiceoverEnabled && musicEnabled && captionsEnabled;
      
      if (selectedVideo.projectId) {
        if (!isDefaultVariant) {
          // User wants a custom variant - call getVideoVariant to compose it
          console.log('[download] Getting custom variant:', { voice: voiceoverEnabled, music: musicEnabled, captions: captionsEnabled });
          try {
            const variantResult = await getVideoVariant({
              projectId: selectedVideo.projectId as any,
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
            const freshUrl = await getFreshVideoUrl({ projectId: selectedVideo.projectId as any });
            if (freshUrl) {
              downloadUrl = freshUrl;
            }
          }
        } else {
          // Default variant - just get fresh URL
          try {
            const freshUrl = await getFreshVideoUrl({ projectId: selectedVideo.projectId as any });
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
      } else {
        // Mobile: download to local file first, then save to media library
        const fileUri = `${FileSystem.documentDirectory}reelfull_${Date.now()}.mp4`;
        
        console.log('[Download] Downloading video from:', downloadUrl);
        console.log('[Download] To local path:', fileUri);
        
        // Download from remote URL to local file
        const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);
        
        if (downloadResult.status === 200) {
          console.log('[Download] Download complete, saving to media library...');
          const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
          await MediaLibrary.createAlbumAsync('Reelful', asset, false);
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

  const handleCopyScript = async () => {
    // Use script if available, otherwise fall back to prompt
    const textToCopy = selectedVideo?.script || selectedVideo?.prompt;
    if (!textToCopy) return;

    try {
      // Transform text: replace "???" with "?"
      const transformedText = textToCopy.replace(/\?\?\?/g, '?');
      
      await Clipboard.setStringAsync(transformedText);
      setIsCopied(true);
      
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Copy error:', error);
      Alert.alert('Error', 'Failed to copy text. Please try again.');
    }
  };

  const handleRegenerate = async () => {
    if (!selectedVideo?.projectId || isRegenerating) return;

    setIsRegenerating(true);
    try {
      console.log('[feed] Regenerating project editing for:', selectedVideo.projectId);
      
      // Call the backend to create a new project with same assets but regenerated editing
      const result = await regenerateProjectEditing({
        sourceProjectId: selectedVideo.projectId as any,
      });

      if (result.success && result.newProjectId) {
        console.log('[feed] New project created:', result.newProjectId);
        
        // Optimistically add the new video to the feed with processing status
        const transformedScript = selectedVideo.script?.replace(/\?\?\?/g, '?');
        addVideo({
          id: result.newProjectId,
          uri: '',
          prompt: selectedVideo.prompt,
          script: transformedScript,
          createdAt: Date.now(),
          status: 'processing',
          projectId: result.newProjectId,
          thumbnailUrl: selectedVideo.thumbnailUrl,
        });

        // Close the modal
        closeModal();
      } else {
        throw new Error('Failed to create regenerated project');
      }
    } catch (error) {
      console.error('[feed] Regenerate error:', error);
      
      // Check for specific error types
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('FREE_TIER_LIMIT_REACHED') || errorMessage.includes('NO_CREDITS_AVAILABLE')) {
        // Close modal first, then show paywall
        closeModal();
        setTimeout(() => {
          router.push('/paywall');
        }, 300);
      } else {
        Alert.alert('Error', 'Failed to regenerate video. Please try again.');
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  // Get remaining credits display text
  const getCreditsDisplay = () => {
    if (!videoGenerationStatus) return null;
    
    const { isPremium, totalCreditsRemaining, subscriptionCreditsRemaining, purchasedCredits } = videoGenerationStatus;
    
    // For premium users, show subscription + bonus breakdown
    if (isPremium) {
      const total = totalCreditsRemaining;
      return { count: total, label: 'credits' };
    }
    
    // For free users
    return { count: totalCreditsRemaining, label: 'videos left' };
  };

  const creditsDisplay = getCreditsDisplay();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>Reelful</Text>
            <Image 
              source={require('../assets/images/icon-no-bg.png')}
              style={styles.headerIcon}
            />
          </View>
          <View style={styles.headerRight}>
            {/* Credits Counter */}
            {creditsDisplay && (
              <TouchableOpacity
                style={styles.creditsCounter}
                onPress={() => router.push('/paywall')}
                activeOpacity={0.8}
              >
                <Zap size={14} color={Colors.orange} strokeWidth={2.5} />
                <Text style={styles.creditsCounterText}>
                  {creditsDisplay.count}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
            >
              <Settings size={24} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <FlatList
        data={videoRows}
        renderItem={renderRow}
        keyExtractor={(item, index) => `row-${index}-${item.map(v => v.id).join('-')}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.orange}
            colors={[Colors.orange]}
          />
        }
      />

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        onPress={handleCreateNew}
        activeOpacity={0.8}
      >
        <Plus size={32} color={Colors.white} strokeWidth={3} />
      </TouchableOpacity>

      <Modal
        visible={selectedVideo !== null}
        animationType="none"
        transparent={true}
        onRequestClose={closeModal}
      >
        {selectedVideo && (
          <Animated.View 
            style={[
              styles.modalBackdrop,
              { opacity: backdropOpacity }
            ]}
          >
            <TouchableOpacity 
              style={styles.backdropTouchable} 
              activeOpacity={1}
              onPress={closeModal}
            />
            <GestureDetector gesture={panGesture}>
              <Animated.View
                style={[
                  styles.modalContainer,
                  {
                    transform: [{ translateY }],
                  },
                ]}
              >
                {/* Drag Handle */}
                <View style={styles.dragHandle} />

                <View style={[styles.modalHeader, { paddingTop: 4 }]}>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={closeModal}
                    activeOpacity={0.7}
                  >
                    <X size={24} color={Colors.white} strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalContent}>
                  <View style={styles.modalTitleSection}>
                    <Text style={styles.modalTitle}>Ready to share!</Text>
                  </View>

                  <View style={styles.videoPreviewContainer}>
                    <VideoView
                      player={modalPlayer}
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
                      disabled={!selectedVideo?.script && !selectedVideo?.prompt}
                    >
                      {isCopied ? (
                        <Check size={18} color={Colors.orange} strokeWidth={2.5} />
                      ) : (
                        <Copy size={18} color={Colors.white} strokeWidth={2.5} />
                      )}
                    </TouchableOpacity>
                    <Text style={styles.promptText} numberOfLines={2} ellipsizeMode="tail">{selectedVideo.script || selectedVideo.prompt}</Text>
                  </View>

                  <View style={styles.modalActions}>
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
                      style={styles.downloadGradientButton}
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
                      style={styles.downloadGradientButton}
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
                </View>
              </Animated.View>
            </GestureDetector>
          </Animated.View>
        )}
      </Modal>

      {/* Action Sheet Modal */}
      {showActionSheet && (
        <View style={styles.actionSheetWrapper} pointerEvents="box-none">
          <Animated.View 
            style={[
              styles.actionSheetBackdrop,
              { opacity: actionSheetBackdropOpacity }
            ]}
            pointerEvents="box-none"
          >
            <TouchableOpacity 
              style={styles.backdropTouchable} 
              activeOpacity={1}
              onPress={closeActionSheet}
            />
          </Animated.View>
          <View
            style={[
              styles.actionSheetContainer,
              {
                position: 'absolute',
                // For right column (2), position on left side; for left/middle (0,1), position on right side
                left: actionSheetPosition.columnIndex === 2
                  ? actionSheetPosition.pageX - 108 // Left side for right column
                  : actionSheetPosition.pageX + actionSheetPosition.width + 8, // Right side for left/middle columns
                top: actionSheetPosition.pageY + actionSheetPosition.height - 38,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={async () => {
                if (!actionSheetVideo) return;
                closeActionSheet();
                
                // Small delay to let action sheet close first
                setTimeout(async () => {
                  try {
                    // Delete from backend database first (if it has a projectId)
                    if (actionSheetVideo.projectId) {
                      await deleteProjectMutation({ id: actionSheetVideo.projectId as any });
                    }
                    
                    // Then delete from local state (will trigger grid remount via useEffect)
                    deleteVideo(actionSheetVideo.id);
                  } catch (error) {
                    console.error('Error deleting video:', error);
                    Alert.alert('Error', 'Failed to delete video. Please try again.');
                  }
                }, 200);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.actionSheetOptionContent}>
                <Trash2 size={18} color="#ff3b30" strokeWidth={2} />
                <Text style={styles.actionSheetOptionTextDelete}>Delete</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    paddingLeft: 24,
    paddingRight: ITEM_SPACING,
    paddingBottom: 16,
    backgroundColor: Colors.black,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
    marginLeft: 6,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creditsCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  creditsCounterText: {
    fontSize: 14,
    fontFamily: Fonts.title,
    fontWeight: '600',
    color: Colors.orange,
  },
  settingsButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grid: {
    padding: ITEM_SPACING,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: ITEM_SPACING,
  },
  thumbnailContainer: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.gray,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 6,
    maxWidth: ITEM_WIDTH - 16,
  },
  thumbnailPrompt: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  errorThumbnail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray,
  },
  errorText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginTop: 8,
    textAlign: 'center',
  },
  processingThumbnail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.grayDark,
    gap: 12,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  processingText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.orange,
  },
  draftThumbnail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.grayDark,
    gap: 12,
  },
  draftOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  draftText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  noThumbnailContainer: {
    flex: 1,
    backgroundColor: Colors.grayDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noThumbnailText: {
    color: Colors.grayLight,
    fontFamily: Fonts.regular,
    fontSize: 12,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: Fonts.regular,
    color: Colors.white,
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    textAlign: 'center',
  },
  startCreatingButton: {
    marginTop: 32,
    backgroundColor: Colors.orange,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  startCreatingText: {
    fontSize: 18,
    fontFamily: Fonts.title,
    fontWeight: '600',
    color: Colors.white,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: Colors.black,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '94%',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: Colors.gray,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'flex-start',
    paddingBottom: 40,
    paddingTop: 0,
  },
  modalTitleSection: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 0,
  },
  modalTitle: {
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
  modalActions: {
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
  downloadGradientButton: {
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
  // Action Sheet
  actionSheetWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  actionSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  actionSheetContainer: {
    width: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  actionSheetOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionSheetOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionSheetOptionTextDelete: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: '#ff3b30',
    fontWeight: '600',
  },
  thumbnailTouchable: {
    width: '100%',
    height: '100%',
  },
  selectedBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderColor: Colors.orange,
    borderRadius: 12,
    pointerEvents: 'none',
  },
});
