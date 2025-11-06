import { useRouter } from 'expo-router';
import { Plus, Trash2, Download, Settings, Loader2, AlertCircle } from 'lucide-react-native';
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
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Video as VideoType } from '@/types';
import { useVideoPolling, registerForPushNotificationsAsync } from '@/lib/videoPollingService';
import { Fonts } from '@/constants/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SPACING = 8;
const ITEM_WIDTH = (SCREEN_WIDTH - ITEM_SPACING * 3) / 2;

function VideoThumbnail({ 
  item, 
  onPress, 
  onDelete 
}: { 
  item: VideoType; 
  onPress: () => void;
  onDelete: () => void;
}) {
  const spinAnim = useRef(new Animated.Value(0)).current;

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
      <View style={styles.thumbnailContainer}>
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
        <TouchableOpacity
          style={styles.thumbnailDeleteButton}
          onPress={onDelete}
          activeOpacity={0.7}
        >
          <Trash2 size={18} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  }

  // Show error state for failed videos
  if (item.status === 'failed') {
    return (
      <TouchableOpacity
        style={styles.thumbnailContainer}
        onPress={() => Alert.alert('Generation Failed', item.error || 'Video generation failed. Please try again.')}
        activeOpacity={0.9}
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
        <TouchableOpacity
          style={styles.thumbnailDeleteButton}
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          activeOpacity={0.7}
        >
          <Trash2 size={18} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
      </TouchableOpacity>
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
    <TouchableOpacity
      style={styles.thumbnailContainer}
      onPress={onPress}
      activeOpacity={0.9}
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
      <TouchableOpacity
        style={styles.thumbnailDeleteButton}
        onPress={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color={Colors.white} strokeWidth={2} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { videos, deleteVideo, userId, syncedFromBackend, syncVideosFromBackend } = useApp();
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Fetch user's projects from backend
  const backendProjects = useQuery(
    api.tasks.getProjects,
    userId ? { userId } : "skip"
  );
  
  // Convex mutation for deleting projects
  const deleteProjectMutation = useMutation(api.tasks.deleteProject);

  // Sync videos from backend when projects are loaded
  useEffect(() => {
    if (backendProjects && !syncedFromBackend && userId) {
      console.log('[feed] Backend projects loaded, syncing...');
      syncVideosFromBackend(backendProjects);
    }
  }, [backendProjects, syncedFromBackend, userId, syncVideosFromBackend]);
  
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
  const opacity = useRef(new Animated.Value(1)).current;

  const closeModal = () => {
    setSelectedVideo(null);
    translateY.setValue(0);
    opacity.setValue(1);
  };

  // Slide down gesture to close modal
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow downward drag
      if (event.translationY > 0) {
        translateY.setValue(event.translationY);
        // Gradually fade out as user drags down
        opacity.setValue(Math.max(0.5, 1 - event.translationY / 400));
      }
    })
    .onEnd((event) => {
      // If swiped down far enough or with velocity, close modal
      if (event.translationY > 150 || event.velocityY > 500) {
        // Fast animate out before closing
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 800,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          closeModal();
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
          Animated.spring(opacity, {
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

  const renderVideoThumbnail = ({ item }: { item: VideoType }) => (
    <VideoThumbnail 
      item={item} 
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
      onDelete={() => handleDeleteFromGallery(item)}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No reels yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to create your first story
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
        Alert.alert('Success', 'Video download started!');
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
          Alert.alert('Success', 'Video saved to your gallery!');
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
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={renderEmpty}
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
        onRequestClose={closeModal}
      >
        {selectedVideo && (
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.modalContainer,
                {
                  transform: [{ translateY }],
                  opacity,
                },
              ]}
            >
              <VideoView
                player={modalPlayer}
                style={styles.fullVideo}
                contentFit="contain"
                nativeControls={true}
              />
              <View style={[styles.modalButtons, { top: insets.top + 16 }]}>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={handleDownload}
                  activeOpacity={0.8}
                  disabled={isDownloading}
                >
                  {isDownloading ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Download size={24} color={Colors.white} strokeWidth={2} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                  activeOpacity={0.8}
                >
                  <Trash2 size={24} color={Colors.white} strokeWidth={2} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.modalOverlay}
                onPress={() => setIsPromptExpanded(!isPromptExpanded)}
                activeOpacity={0.9}
              >
                <Text
                  style={styles.modalPrompt}
                  numberOfLines={isPromptExpanded ? undefined : 2}
                >
                  {selectedVideo.prompt}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </GestureDetector>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    paddingHorizontal: 24,
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
    borderRadius: 22,
    backgroundColor: Colors.gray,
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
  thumbnailDeleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.white,
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
    fontSize: 28,
    fontFamily: Fonts.title,
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
    borderRadius: 32,
    backgroundColor: Colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  fullVideo: {
    width: '100%',
    height: '100%',
  },
  modalButtons: {
    position: 'absolute',
    right: 24,
    flexDirection: 'row',
    gap: 12,
  },
  downloadButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  modalOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    padding: 16,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 0,
  },
  modalPrompt: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.white,
    lineHeight: 20,
  },
});
