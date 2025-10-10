import { useRouter } from 'expo-router';
import { Image as LucideImage, Upload, X } from 'lucide-react-native';
import { useState, useRef } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  PanResponder,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';

function VideoThumbnail({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (player) => {
    player.muted = true;
    // Don't autoplay thumbnails
  });
  
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export default function ComposerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const [prompt, setPrompt] = useState('');
  const [mediaUris, setMediaUris] = useState<{ uri: string; type: 'video' | 'image' }[]>([]);
  
  const pan = useRef(new Animated.Value(0)).current;
  
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          pan.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          router.back();
        } else {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos', 'images'],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newMedia = result.assets.map(asset => ({
        uri: asset.uri,
        type: (asset.type === 'video' ? 'video' : 'image') as 'video' | 'image',
      }));
      console.log('Selected media:', newMedia);
      setMediaUris(prev => [...prev, ...newMedia]);
    }
  };

  const removeMedia = (index: number) => {
    setMediaUris(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (prompt.trim() && mediaUris.length > 0) {
      console.log('Submitting with media:', mediaUris);
      router.push({
        pathname: '/loader',
        params: { 
          prompt: prompt.trim(), 
          mediaUris: JSON.stringify(mediaUris),
        },
      });
    }
  };

  const isValid = prompt.trim().length > 0 && mediaUris.length > 0;

  return (
    <View style={styles.backgroundContainer}>
      <Animated.View 
        style={[
          styles.container, 
          { transform: [{ translateY: pan }] }
        ]}
        {...panResponder.panHandlers}
      >
        <LinearGradient
          colors={[Colors.black, Colors.grayDark]}
          style={styles.gradient}
        >
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 20 }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <X size={28} color={Colors.white} strokeWidth={2.5} />
        </TouchableOpacity>
        
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                Hey, {user?.name || 'there'}, what&apos;s your day been like?
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tell your story</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Describe your day..."
                  placeholderTextColor={Colors.grayLight}
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Upload Media</Text>
                {mediaUris.length > 0 && (
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.mediaScroll}
                    contentContainerStyle={styles.mediaScrollContent}
                  >
                    {mediaUris.map((media, index) => (
                      <View key={index} style={styles.mediaPreview}>
                        {media.type === 'video' ? (
                          <VideoThumbnail
                            uri={media.uri}
                            style={styles.mediaThumbnail}
                          />
                        ) : (
                          <Image
                            source={{ uri: media.uri }}
                            style={styles.mediaThumbnail}
                          />
                        )}
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => removeMedia(index)}
                          activeOpacity={0.7}
                        >
                          <X size={16} color={Colors.white} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={pickMedia}
                  activeOpacity={0.7}
                >
                  <Upload size={32} color={Colors.orange} strokeWidth={2} />
                  <Text style={styles.uploadText}>
                    {mediaUris.length > 0 ? 'Add more' : 'Tap to upload photos/videos'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.exampleContainer}>
                <View style={styles.exampleHeader}>
                  <LucideImage size={20} color={Colors.orange} />
                  <Text style={styles.exampleTitle}>Example Story</Text>
                </View>
                <Text style={styles.exampleText}>
                  &quot;Had an amazing morning coffee at the new cafe downtown. The
                  sunset views were incredible!&quot;
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.button, !isValid && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!isValid}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    isValid
                      ? [Colors.orange, Colors.orangeLight]
                      : [Colors.gray, Colors.grayLight]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>Generate Reel</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundContainer: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 32,
    paddingTop: 50,
  },
  closeButton: {
    position: 'absolute',
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.white,
    lineHeight: 32,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.white,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 120,
  },
  uploadButton: {
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.orange,
    borderStyle: 'dashed',
  },
  uploadText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.orange,
    fontWeight: '600' as const,
  },
  mediaScroll: {
    marginBottom: 12,
  },
  mediaScrollContent: {
    gap: 12,
  },
  mediaPreview: {
    borderRadius: 12,
    overflow: 'hidden',
    width: 120,
    height: 120,
    backgroundColor: Colors.gray,
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    padding: 6,
  },
  exampleContainer: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  exampleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.orange,
  },
  exampleText: {
    fontSize: 14,
    color: Colors.grayLight,
    lineHeight: 20,
    fontStyle: 'italic' as const,
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonGradient: {
    padding: 18,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});
