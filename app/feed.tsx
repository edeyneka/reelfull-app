import { useRouter } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Video as VideoType } from '@/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SPACING = 8;
const ITEM_WIDTH = (SCREEN_WIDTH - ITEM_SPACING * 3) / 2;

function VideoThumbnail({ item, onPress }: { item: VideoType; onPress: () => void }) {
  if (!item.uri || item.uri.length === 0) {
    return (
      <View style={styles.thumbnailContainer}>
        <View style={styles.errorThumbnail}>
          <Text style={styles.errorText}>Unavailable</Text>
        </View>
      </View>
    );
  }

  const thumbnailPlayer = useVideoPlayer(item.uri, (player) => {
    player.muted = true;
    // Don't autoplay thumbnails
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
  const { videos, deleteVideo } = useApp();
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  
  const modalPlayer = useVideoPlayer(
    selectedVideo?.uri || null,
    (player) => {
      if (player && selectedVideo) {
        player.loop = true;
        player.muted = false;
        player.play();
      }
    }
  );

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
      setSelectedVideo(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Reelfull</Text>
        <Text style={styles.headerSubtitle}>Your Story Gallery</Text>
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
        animationType="fade"
        onRequestClose={() => setSelectedVideo(null)}
      >
        {selectedVideo && (
          <View style={styles.modalContainer}>
            <VideoView
              player={modalPlayer}
              style={styles.fullVideo}
              contentFit="contain"
              nativeControls={true}
            />
            <View style={[styles.modalButtons, { top: insets.top + 16 }]}>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
                activeOpacity={0.8}
              >
                <Trash2 size={24} color={Colors.white} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedVideo(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.closeButtonText}>✕</Text>
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
          </View>
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
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  closeButtonText: {
    fontSize: 24,
    color: Colors.white,
    fontWeight: '700' as const,
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
});
