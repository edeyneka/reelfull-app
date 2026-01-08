import { useRouter } from 'expo-router';
import { Plus, Settings, Loader2, AlertCircle, Trash2, FileText, Zap } from 'lucide-react-native';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Animated,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const { videos, deleteVideo, userId, syncedFromBackend, syncVideosFromBackend, syncUserFromBackend } = useApp();
  const { subscriptionState, hasCompletedPaywallThisSession } = usePaywall();
  const [hasShownInitialPaywall, setHasShownInitialPaywall] = useState(false);
  const [actionSheetVideo, setActionSheetVideo] = useState<VideoType | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetPosition, setActionSheetPosition] = useState({ pageX: 0, pageY: 0, width: 0, height: 0, columnIndex: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  
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
  
  // Query projects - always keep active for Convex reactivity to work with new drafts
  const backendProjects = useQuery(
    api.tasks.getProjects,
    userId ? { userId } : "skip"
  );
  
  // Convex mutation for deleting projects
  const deleteProjectMutation = useMutation(api.tasks.deleteProject);
  
  // Action to get fresh video URL on-demand (when user taps to view)
  const getFreshVideoUrl = useAction(api.tasks.getFreshProjectVideoUrl);
  
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

  // Sync videos from backend when projects are loaded or changed
  useEffect(() => {
    if (backendProjects && userId) {
      console.log('[feed] Backend projects updated, syncing...', backendProjects.length, 'projects');
      syncVideosFromBackend(backendProjects);
      if (isRefreshing) {
        setIsRefreshing(false);
      }
    }
  }, [backendProjects, userId, syncVideosFromBackend, isRefreshing]);

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
  
  // Animated values for action sheet
  const actionSheetBackdropOpacity = useRef(new Animated.Value(0)).current;

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
          // Navigate to composer for draft videos
          if (item.status === 'draft' && item.projectId) {
            router.push({
              pathname: '/composer',
              params: { projectId: item.projectId },
            });
          }
          // Only allow opening ready videos with valid URIs
          else if (item.status === 'ready' && item.uri && item.uri.length > 0) {
            // Fetch fresh URL on-demand before opening
            let videoUrl = item.uri;
            if (item.projectId) {
              console.log('[feed] Fetching fresh URL for video...');
              try {
                const freshUrl = await getFreshVideoUrl({ projectId: item.projectId as any });
                if (freshUrl) {
                  console.log('[feed] ✓ Got fresh URL');
                  videoUrl = freshUrl;
                }
              } catch (error) {
                console.error('[feed] Failed to fetch fresh URL:', error);
              }
            }
            // Navigate to video preview screen
            router.push({
              pathname: '/video-preview',
              params: {
                videoId: item.id,
                videoUri: videoUrl,
                prompt: item.prompt,
                script: item.script || '',
                projectId: item.projectId || '',
                thumbnailUrl: item.thumbnailUrl || '',
              },
            });
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
  backdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
