import { useRouter } from 'expo-router';
import { Plus, Trash2, Download, Settings, Loader2 } from 'lucide-react-native';
import { useState, useRef } from 'react';
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
  Image,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Video as VideoType, Project } from '@/types';
import { useQuery } from 'convex/react';
import { api } from '@/backend-api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SPACING = 8;
const ITEM_WIDTH = (SCREEN_WIDTH - ITEM_SPACING * 3) / 2;

function VideoThumbnail({ item, onPress }: { item: any; onPress: () => void }) {
  if (item.status && item.status !== 'completed') {
    console.log('Rendering processing item:', {
      id: item.id,
      status: item.status,
      previewImage: item.previewImage,
    });
    return (
      <TouchableOpacity
        style={styles.thumbnailContainer}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {item.previewImage ? (
          <Image 
            source={{ uri: item.previewImage }} 
            style={styles.thumbnail}
            onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
            onLoad={() => console.log('Image loaded:', item.previewImage)}
          />
        ) : (
          <View style={styles.thumbnail} />
        )}
        <View style={styles.processingOverlay}>
          <Loader2 size={32} color={Colors.orange} />
        </View>
        <View style={styles.thumbnailOverlay}>
          <Text style={styles.thumbnailStatus}>
            {item.status === 'pending' ? 'queued' : 'processing'}
          </Text>
          <Text style={styles.thumbnailPrompt} numberOfLines={2}>
            {item.prompt}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (!item.uri || item.uri.length === 0) {
    return (
      <TouchableOpacity
        style={styles.thumbnailContainer}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {item.previewImage ? (
          <Image source={{ uri: item.previewImage }} style={styles.thumbnail} />
        ) : (
          <View style={styles.errorThumbnail}>
            <Text style={styles.errorText}>Unavailable</Text>
          </View>
        )}
        <View style={styles.thumbnailOverlay}>
          <Text style={styles.thumbnailPrompt} numberOfLines={2}>
            {item.prompt}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  const thumbnailPlayer = useVideoPlayer(item.uri, (player) => {
    player.muted = true;
  });

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
    </TouchableOpacity>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { videos: localVideos, deleteVideo } = useApp();
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const projects = useQuery(api.tasks.getProjects) as Project[] | undefined;
  
  useEffect(() => {
    if (projects) {
      console.log('Projects:', JSON.stringify(projects, null, 2));
      projects.forEach(p => {
        console.log(`Project ${p._id}:`, {
          status: p.status,
          thumbnail: p.thumbnail,
          thumbnailUrl: p.thumbnailUrl,
          files: p.files,
          videoUrl: p.videoUrl
        });
      });
    }
  }, [projects]);
  
  const allItems = [
    ...localVideos,
    ...(projects?.map((p: Project) => {
      const item = {
        id: p._id,
        uri: p.status === 'completed' ? p.videoUrl : undefined,
        prompt: p.prompt,
        createdAt: p._creationTime,
        status: p.status,
        previewImage: p.thumbnailUrl || p.fileUrls?.[0],
      };
      console.log('Mapped item:', item);
      return item;
    }) || [])
  ];

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };
  
  const modalPlayer = useVideoPlayer(
    selectedVideo?.uri ?? null,
    (player) => {
      if (player && selectedVideo?.uri) {
        player.loop = true;
        player.muted = false;
        player.play();
      }
    }
  );

  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const closeModal = () => {
    setSelectedVideo(null);
    translateY.setValue(0);
    opacity.setValue(1);
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.setValue(event.translationY);
        opacity.setValue(Math.max(0.5, 1 - event.translationY / 400));
      }
    })
    .onEnd((event) => {
      if (event.translationY > 150 || event.velocityY > 500) {
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

  const renderVideoThumbnail = ({ item }: { item: VideoType }) => (
    <VideoThumbnail item={item} onPress={() => setSelectedVideo(item)} />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No reels yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to create your first story
      </Text>
    </View>
  );

  const handleDelete = () => {
    if (selectedVideo) {
      deleteVideo(selectedVideo.id);
      closeModal();
    }
  };

  const handleDownload = async () => {
    if (!selectedVideo?.uri) return;

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant permission to save videos to your library.'
        );
        return;
      }

      const asset = await MediaLibrary.createAssetAsync(selectedVideo.uri);
      await MediaLibrary.createAlbumAsync('Reelful', asset, false);
      
      Alert.alert('Success', 'Video saved to your gallery!');
    } catch (error) {
      console.error('Error downloading video:', error);
      Alert.alert('Error', 'Failed to save video. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Reelful</Text>
            <Text style={styles.headerSubtitle}>Your Video Gallery</Text>
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
        data={allItems}
        renderItem={renderVideoThumbnail}
        keyExtractor={(item) => item.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={renderEmpty}
        refreshing={refreshing}
        onRefresh={handleRefresh}
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
                >
                  <Download size={24} color={Colors.white} strokeWidth={2} />
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
  headerTitle: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: Colors.white,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: Colors.orange,
    fontWeight: '600' as const,
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
    color: Colors.white,
    fontWeight: '600' as const,
  },
  errorThumbnail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.gray,
  },
  errorText: {
    fontSize: 12,
    color: Colors.grayLight,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.white,
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 16,
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
    color: Colors.white,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  processingSection: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.black,
  },
  processingSectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.grayLight,
    marginBottom: 12,
  },
  processingList: {
    gap: 8,
  },
  processingContainer: {
    backgroundColor: 'rgba(255, 138, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 0, 0.3)',
  },
  processingContent: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 12,
  },
  processingText: {
    flex: 1,
  },
  processingStatus: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.orange,
    marginBottom: 4,
  },
  processingPrompt: {
    fontSize: 14,
    color: Colors.white,
    fontWeight: '500' as const,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  thumbnailStatus: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.orange,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
  },
});
