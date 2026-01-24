import { useRouter } from 'expo-router';
import { Loader2, AlertCircle, FileText, Zap } from 'lucide-react-native';
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
import { Trash2 } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SPACING = 8;
const ITEM_WIDTH = (SCREEN_WIDTH - ITEM_SPACING * 4) / 3;

// Bottom padding to account for the floating tab bar
const TAB_BAR_HEIGHT = 100;

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

  const isImageUrl = (url?: string) => {
    if (!url) return false;
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    const lowerUrl = url.toLowerCase();
    
    if (videoExtensions.some(ext => lowerUrl.includes(ext))) {
      return false;
    }
    
    if (lowerUrl.includes('convex.cloud/api/storage/')) {
      return true;
    }
    
    return imageExtensions.some(ext => lowerUrl.includes(ext));
  };

  const effectiveThumbnailUrl = isImageUrl(item.thumbnailUrl) ? item.thumbnailUrl : undefined;
  const shouldUseVideoPreview = !effectiveThumbnailUrl && item.uri && item.status === 'ready';

  const thumbnailPlayer = useVideoPlayer(
    shouldUseVideoPreview ? item.uri : null,
    (player) => {
      if (player && shouldUseVideoPreview) {
        player.muted = true;
      }
    }
  );

  useEffect(() => {
    const urlType = item.thumbnailUrl 
      ? (isImageUrl(item.thumbnailUrl) ? 'image' : 'video/other') 
      : 'missing';
    const displayText = item.name || item.prompt;
    console.log(`[Thumbnail] ${displayText}: status=${item.status}, thumbnailUrl=${urlType}, using=${effectiveThumbnailUrl ? 'image' : (shouldUseVideoPreview ? 'video' : 'placeholder')}`);
  }, [item.thumbnailUrl, item.status, item.name, item.prompt, effectiveThumbnailUrl, shouldUseVideoPreview]);

  const handleLongPress = (event: any) => {
    if (thumbnailRef.current) {
      thumbnailRef.current.measure((x, y, width, height, pageX, pageY) => {
        onLongPress({ pageX, pageY, width, height });
      });
    }
  };

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isSelected ? 1.05 : 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [isSelected, scaleAnim]);

  useEffect(() => {
    if (item.status === 'pending' || item.status === 'processing') {
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
      
      return () => {
        animation.stop();
      };
    }
  }, [item.status, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
              {item.name || item.prompt}
            </Text>
          </View>
        </TouchableOpacity>
        {isSelected && <View style={styles.selectedBorder} />}
      </Animated.View>
    );
  }

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
            {item.name || item.prompt}
          </Text>
        </View>
      </TouchableOpacity>
      {isSelected && <View style={styles.selectedBorder} />}
    </Animated.View>
  );
}

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
            {item.name || item.prompt}
          </Text>
        </View>
      </TouchableOpacity>
      {isSelected && <View style={styles.selectedBorder} />}
    </Animated.View>
  );
}

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
          {item.name || item.prompt}
        </Text>
      </View>
      </TouchableOpacity>
      {isSelected && <View style={styles.selectedBorder} />}
    </Animated.View>
  );
}

export default function FeedTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { videos, deleteVideo, userId, syncedFromBackend, syncVideosFromBackend, syncUserFromBackend } = useApp();
  const { subscriptionState, hasCompletedPaywallThisSession } = usePaywall();
  const [actionSheetVideo, setActionSheetVideo] = useState<VideoType | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetPosition, setActionSheetPosition] = useState({ pageX: 0, pageY: 0, width: 0, height: 0, columnIndex: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const hasPendingVideos = useMemo(() => 
    videos.some(v => v.status === 'pending' || v.status === 'processing'),
    [videos]
  );
  
  const backendUser = useQuery(
    api.users.getCurrentUser,
    userId ? { userId } : "skip"
  );
  
  const backendProjects = useQuery(
    api.tasks.getProjects,
    userId ? { userId } : "skip"
  );
  
  const deleteProjectMutation = useMutation(api.tasks.deleteProject);
  const getFreshVideoUrl = useAction(api.tasks.getFreshProjectVideoUrl);
  
  const videoGenerationStatus = useQuery(
    api.users.getVideoGenerationStatus,
    userId ? { userId } : "skip"
  );

  useEffect(() => {
    if (backendUser && userId) {
      console.log('[feed] Syncing user profile from backend');
      syncUserFromBackend(backendUser);
    }
  }, [backendUser, userId, syncUserFromBackend]);

  useEffect(() => {
    if (backendProjects && userId) {
      console.log('[feed] Backend projects updated, syncing...', backendProjects.length, 'projects');
      syncVideosFromBackend(backendProjects);
      if (isRefreshing) {
        setIsRefreshing(false);
      }
    }
  }, [backendProjects, userId, syncVideosFromBackend, isRefreshing]);

  const videoRows = useMemo(() => {
    const sortedVideos = [...videos].sort((a, b) => b.createdAt - a.createdAt);
    const rows: VideoType[][] = [];
    for (let i = 0; i < sortedVideos.length; i += 3) {
      rows.push(sortedVideos.slice(i, i + 3));
    }
    return rows;
  }, [videos]);

  const handleRefresh = useCallback(() => {
    console.log('[feed] User initiated refresh');
    setIsRefreshing(true);
  }, []);
  
  useVideoPolling();

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const actionSheetBackdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showActionSheet) {
      actionSheetBackdropOpacity.setValue(0);
      
      Animated.timing(actionSheetBackdropOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [showActionSheet, actionSheetBackdropOpacity]);

  const closeActionSheet = () => {
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

  const renderVideoThumbnail = (item: VideoType, globalIndex: number, columnIndex: number) => {
    return (
      <VideoThumbnail 
        key={item.id}
        item={item} 
        isSelected={actionSheetVideo?.id === item.id}
        onPress={async () => {
          if (item.status === 'draft' && item.projectId) {
            router.push({
              pathname: '/composer',
              params: { projectId: item.projectId },
            });
          }
          else if (item.status === 'ready' && item.uri && item.uri.length > 0) {
            let videoUrl = item.uri;
            if (item.projectId) {
              console.log('[feed] Fetching fresh URL for video...');
              try {
                const freshUrl = await getFreshVideoUrl({ projectId: item.projectId as any });
                if (freshUrl) {
                  console.log('[feed] Got fresh URL');
                  videoUrl = freshUrl;
                }
              } catch (error) {
                console.error('[feed] Failed to fetch fresh URL:', error);
              }
            }
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
        {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
          <View key={`spacer-${rowIndex}-${i}`} style={{ width: ITEM_WIDTH }} />
        ))}
      </View>
    );
  };

  const handleCreateNew = useCallback(() => {
    const generatedCount = videoGenerationStatus?.generatedCount ?? 0;
    const limit = videoGenerationStatus?.limit ?? 3;
    
    const hasReachedLimit = ENABLE_TEST_RUN_MODE 
      ? generatedCount >= limit 
      : (videoGenerationStatus?.hasReachedLimit ?? false);
    
    const hasAccess = ENABLE_TEST_RUN_MODE 
      ? hasCompletedPaywallThisSession 
      : subscriptionState.isPro;
    
    if (hasReachedLimit && !hasAccess) {
      router.push('/paywall');
      return;
    }
    
    router.push('/composer');
  }, [videoGenerationStatus, subscriptionState.isPro, hasCompletedPaywallThisSession, router]);

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

  const getCreditsDisplay = () => {
    if (!videoGenerationStatus) return null;
    
    const { isPremium, totalCreditsRemaining } = videoGenerationStatus;
    
    if (isPremium) {
      return { count: totalCreditsRemaining, label: 'credits' };
    }
    
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
              source={require('../../assets/images/icon-no-bg.png')}
              style={styles.headerIcon}
            />
          </View>
          <View style={styles.headerRight}>
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
          </View>
        </View>
      </View>

      <FlatList
        data={videoRows}
        renderItem={renderRow}
        keyExtractor={(item, index) => `row-${index}-${item.map(v => v.id).join('-')}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.grid, { paddingBottom: TAB_BAR_HEIGHT }]}
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
                left: actionSheetPosition.columnIndex === 2
                  ? actionSheetPosition.pageX - 108
                  : actionSheetPosition.pageX + actionSheetPosition.width + 8,
                top: actionSheetPosition.pageY + actionSheetPosition.height - 38,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={async () => {
                if (!actionSheetVideo) return;
                closeActionSheet();
                
                setTimeout(async () => {
                  try {
                    if (actionSheetVideo.projectId) {
                      await deleteProjectMutation({ id: actionSheetVideo.projectId as any });
                    }
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
  backdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
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
