import { useRouter } from 'expo-router';
import { Image as LucideImage, Upload, X, TestTube } from 'lucide-react-native';
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
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { uploadMediaFiles } from '@/lib/api-helpers';
import { Asset } from 'expo-asset';

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
  const { user, userId } = useApp();
  const [prompt, setPrompt] = useState('');
  const [mediaUris, setMediaUris] = useState<{ uri: string; type: 'video' | 'image' }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isTestRun, setIsTestRun] = useState(false);
  
  // Convex hooks
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl);
  const createProject = useMutation(api.tasks.createProject);
  const generateScriptOnly = useAction(api.tasks.generateScriptOnly);
  const updateProjectScript = useMutation(api.tasks.updateProjectScript);
  
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

  const loadSampleMedia = async () => {
    try {
      // Load sample videos from assets
      const sampleAssets = [
        require('@/assets/media/sample_video_1.MOV'),
        require('@/assets/media/sample_video_2.MOV'),
        require('@/assets/media/sample_video_3.MOV'),
      ];

      const assets = await Asset.loadAsync(sampleAssets);
      const sampleMedia = assets.map(asset => ({
        uri: asset.localUri || asset.uri,
        type: 'video' as const,
      }));

      setMediaUris(sampleMedia);
      console.log('Loaded sample media:', sampleMedia.length, 'files');
    } catch (error) {
      console.error('Failed to load sample media:', error);
      alert('Failed to load sample media');
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || mediaUris.length === 0 || !userId) {
      return;
    }

    setIsUploading(true);

    try {
      console.log('=== COMPOSER: Starting upload ===');
      console.log('Test Run Mode:', isTestRun);
      console.log('Prompt:', prompt.trim());
      console.log('Media count:', mediaUris.length);

      // Upload all media files to Convex
      const uploads = await uploadMediaFiles(
        generateUploadUrl,
        mediaUris.map(m => ({ uri: m.uri, type: m.type }))
      );

      console.log('Uploads complete:', uploads.length);

      // Create project
      const projectId = await createProject({
        userId,
        prompt: prompt.trim(),
        files: uploads.map(u => u.storageId),
        fileMetadata: uploads,
        thumbnail: uploads[0].storageId,
      });

      console.log('Project created:', projectId);

      if (isTestRun) {
        // Test run mode: Load sample script from assets
        console.log('Test run mode: Loading sample script...');
        const sampleScriptAsset = Asset.fromModule(require('@/assets/media/sample_script.txt'));
        await sampleScriptAsset.downloadAsync();
        const scriptResponse = await fetch(sampleScriptAsset.localUri || sampleScriptAsset.uri);
        const sampleScript = await scriptResponse.text();
        
        // Update project with sample script directly
        console.log('Setting sample script, length:', sampleScript.length);
        await updateProjectScript({
          id: projectId,
          script: sampleScript.trim(),
        });
        
        // Navigate to script review with test mode flag
        router.replace({
          pathname: '/script-review',
          params: { 
            projectId: projectId.toString(),
            testRun: 'true',
          },
        });
      } else {
        // Normal mode: Start script generation
        console.log('Starting script generation...');
        await generateScriptOnly({ projectId });

        // Navigate to script review
        router.replace({
          pathname: '/script-review',
          params: { projectId: projectId.toString() },
        });
      }
    } catch (error) {
      console.error('Error in composer:', error);
      alert(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
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

              <View style={styles.exampleContainer}>
                <View style={styles.exampleHeader}>
                  <LucideImage size={14} color={Colors.orange} />
                  <Text style={styles.exampleTitle}>Example Story</Text>
                </View>
                <Text style={styles.exampleText}>
                  &quot;I went to the a16z Tech Week in SF - met inspiring founders and caught up with old friends. The focus was on pre-seed fundraising. My three main takeaways: storytelling wins, community opens doors, and clarity beats buzzwords.&quot;
                </Text>
              </View>

              <View style={styles.testRunContainer}>
                <View style={styles.testRunHeader}>
                  <TestTube size={16} color={Colors.orange} />
                  <Text style={styles.testRunLabel}>Test Run Mode</Text>
                </View>
                <Switch
                  value={isTestRun}
                  onValueChange={(value) => {
                    setIsTestRun(value);
                    if (value) {
                      loadSampleMedia();
                    } else {
                      setMediaUris([]);
                    }
                  }}
                  trackColor={{ false: Colors.gray, true: Colors.orangeLight }}
                  thumbColor={isTestRun ? Colors.orange : Colors.grayLight}
                  ios_backgroundColor={Colors.gray}
                />
              </View>
              {isTestRun && (
                <View style={styles.testRunInfo}>
                  <Text style={styles.testRunInfoText}>
                    ℹ️ Sample media, script, voice, and SRT will be used. Script generation and voice synthesis will be skipped.
                  </Text>
                </View>
              )}

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
                {!isTestRun && (
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={pickMedia}
                    activeOpacity={0.7}
                  >
                    <Upload size={28} color={Colors.orange} strokeWidth={2} />
                    <Text style={styles.uploadText}>
                      {mediaUris.length > 0 ? 'Add more' : 'Tap to upload photos/videos'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.button, (!isValid || isUploading) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!isValid || isUploading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    isValid && !isUploading
                      ? [Colors.orange, Colors.orangeLight]
                      : [Colors.gray, Colors.grayLight]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {isUploading ? (
                    <>
                      <ActivityIndicator size="small" color={Colors.white} />
                      <Text style={styles.buttonText}>Uploading...</Text>
                    </>
                  ) : (
                    <Text style={styles.buttonText}>Generate Reel</Text>
                  )}
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
    marginBottom: 20,
    paddingTop: 40,
  },
  closeButton: {
    position: 'absolute',
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.white,
    lineHeight: 28,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
    marginBottom: 10,
  },
  input: {
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.white,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 90,
  },
  uploadButton: {
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 28,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.orange,
    borderStyle: 'dashed',
  },
  uploadText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.orange,
    fontWeight: '600' as const,
  },
  mediaScroll: {
    marginBottom: 10,
  },
  mediaScrollContent: {
    gap: 10,
  },
  mediaPreview: {
    borderRadius: 10,
    overflow: 'hidden',
    width: 100,
    height: 100,
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
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  exampleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  exampleTitle: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.orange,
  },
  exampleText: {
    fontSize: 10,
    color: Colors.grayLight,
    lineHeight: 14,
    fontStyle: 'italic' as const,
  },
  testRunContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.orange + '40',
  },
  testRunHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  testRunLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  testRunInfo: {
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  testRunInfoText: {
    fontSize: 12,
    color: Colors.grayLight,
    lineHeight: 18,
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonGradient: {
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});
