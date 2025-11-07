import { useRouter } from 'expo-router';
import { Plus, Download, Settings, Loader2, AlertCircle, X, Trash2 } from 'lucide-react-native';
import { useState, useRef, useEffect } from 'react';
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
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
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

  // Always call hooks in the same order - create player even if not used
  const hasValidUri = item.uri && item.uri.length > 0 && item.status === 'ready';
  const thumbnailPlayer = useVideoPlayer(
    hasValidUri ? item.uri : null,
    (player) => {
      if (player && hasValidUri) {
        player.muted = true;
        // Don't autoplay thumbnails
      }
    }
  );

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

  useEffect(() => {
    if (item.status === 'pending' || item.status === 'processing') {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [item.status, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
          <View style={styles.processingThumbnail}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Loader2 size={40} color={Colors.orange} strokeWidth={2} />
            </Animated.View>
            <Text style={styles.processingText}>
              {item.status === 'pending' ? 'Queued...' : 'Generating...'}
            </Text>
          </View>
          <View style={styles.thumbnailOverlay}>
            <Text style={styles.thumbnailPrompt} numberOfLines={2}>
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
          <View style={styles.errorThumbnail}>
            <AlertCircle size={32} color={Colors.white} strokeWidth={2} />
            <Text style={styles.errorText}>Failed</Text>
          </View>
          <View style={styles.thumbnailOverlay}>
            <Text style={styles.thumbnailPrompt} numberOfLines={2}>
              {item.prompt}
            </Text>
          </View>
        </TouchableOpacity>
        {isSelected && <View style={styles.selectedBorder} />}
      </Animated.View>
    );
  }

  if (!item.uri || item.uri.length === 0) {
    return (
      <View style={styles.thumbnailContainer}>
        <View style={styles.errorThumbnail}>
          <Text style={styles.errorText}>Unavailable</Text>
        </View>
      </View>
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
        <VideoView
          player={thumbnailPlayer}
          style={styles.thumbnail}
          contentFit="cover"
          nativeControls={false}
        />
        <View style={styles.thumbnailOverlay}>
          <Text style={styles.thumbnailPrompt} numberOfLines={2}>
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
  const { videos, deleteVideo, userId, syncedFromBackend, syncVideosFromBackend } = useApp();
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [actionSheetVideo, setActionSheetVideo] = useState<VideoType | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetPosition, setActionSheetPosition] = useState({ pageX: 0, pageY: 0, width: 0, height: 0, columnIndex: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shouldRefetch, setShouldRefetch] = useState(false);
  
  // Only fetch from backend if we haven't synced yet OR user pulls to refresh (cache-first strategy)
  const backendProjects = useQuery(
    api.tasks.getProjects,
    ((!syncedFromBackend || shouldRefetch) && userId) ? { userId } : "skip"
  );
  
  // Convex mutation for deleting projects
  const deleteProjectMutation = useMutation(api.tasks.deleteProject);

  // Sync videos from backend when projects are loaded
  useEffect(() => {
    if (backendProjects && userId) {
      if (!syncedFromBackend) {
        console.log('[feed] Initial sync: Backend projects loaded, syncing...');
        syncVideosFromBackend(backendProjects);
      } else if (shouldRefetch) {
        console.log('[feed] Refresh: Backend projects loaded, syncing...');
        syncVideosFromBackend(backendProjects);
        setShouldRefetch(false);
        setIsRefreshing(false);
      }
    }
  }, [backendProjects, syncedFromBackend, userId, syncVideosFromBackend, shouldRefetch]);

  // Handle pull-to-refresh
  const handleRefresh = () => {
    console.log('[feed] User initiated refresh');
    setIsRefreshing(true);
    setShouldRefetch(true);
  };
  
  // Enable video polling for pending videos
  useVideoPolling();

  // Request notification permissions on mount
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);
  
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

  const renderVideoThumbnail = ({ item, index }: { item: VideoType; index: number }) => {
    const columnIndex = index % 3; // 0 = left, 1 = middle, 2 = right
    
    return (
      <VideoThumbnail 
        item={item} 
        isSelected={actionSheetVideo?.id === item.id}
        onPress={() => {
          // Only allow opening ready videos with valid URIs
          if (item.status === 'ready' && item.uri && item.uri.length > 0) {
            setSelectedVideo(item);
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

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No reels yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to create your first video
      </Text>
    </View>
  );

  const handleDelete = async () => {
    if (!selectedVideo) return;

    try {
      // Delete from backend database first (if it has a projectId)
      if (selectedVideo.projectId) {
        await deleteProjectMutation({ id: selectedVideo.projectId as any });
      }
      
      // Then delete from local state
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
        link.href = selectedVideo.uri;
        link.download = `reelfull_${Date.now()}.mp4`;
        link.click();
        setDownloadSuccess(true);
      } else {
        // Mobile: download to local file first, then save to media library
        const fileUri = `${FileSystem.documentDirectory}reelfull_${Date.now()}.mp4`;
        
        console.log('[Download] Downloading video from:', selectedVideo.uri);
        console.log('[Download] To local path:', fileUri);
        
        // Download from remote URL to local file
        const downloadResult = await FileSystem.downloadAsync(selectedVideo.uri, fileUri);
        
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
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
            activeOpacity={0.7}
          >
            <Settings size={24} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={videos}
        renderItem={renderVideoThumbnail}
        keyExtractor={(item) => item.id}
        extraData={videos.length}
        numColumns={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
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
        onPress={() => router.push('/composer')}
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

                <View style={[styles.modalHeader, { paddingTop: 12 }]}>
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
                      nativeControls={false}
                    />
                  </View>

                  <View style={styles.modalActions}>
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
                          <ActivityIndicator size="small" color={Colors.white} />
                        ) : (
                          <>
                            <Download size={20} color={Colors.white} strokeWidth={2.5} />
                            <Text style={styles.downloadButtonText}>Download</Text>
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
                    
                    // Then delete from local state
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
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  thumbnailPrompt: {
    fontSize: 12,
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
  processingText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.orange,
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
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'flex-start',
    paddingBottom: 40,
    paddingTop: 12,
  },
  modalTitleSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
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
    marginBottom: 32,
  },
  videoPreview: {
    width: '65%',
    aspectRatio: 9 / 16,
    maxHeight: 380,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.grayDark,
  },
  modalActions: {
    alignItems: 'center',
    gap: 16,
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
    paddingVertical: 16,
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
