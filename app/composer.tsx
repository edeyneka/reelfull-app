import { useRouter } from 'expo-router';
import { Image as LucideImage, Upload, X, TestTube } from 'lucide-react-native';
import { useState, useRef, useEffect } from 'react';
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
import { Fonts } from '@/constants/typography';

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
  
  // Animated values for slide gesture
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Animate modal in when mounted
  useEffect(() => {
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
  }, [translateY, backdropOpacity]);

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
      router.back();
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
        closeModal();
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

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <Text style={styles.title}>
                  Hey, {user?.name || 'there'}, share your story!
                </Text>
              </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <TextInput
                  style={styles.input}
                  placeholder="Describe your day, event, or experience..."
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
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#000000',
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
    backgroundColor: '#333333',
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
    paddingTop: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.title,
    color: Colors.white,
    lineHeight: 28,
    textAlign: 'center',
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontFamily: Fonts.regular,
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
    fontFamily: Fonts.regular,
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
    fontFamily: Fonts.regular,
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
    fontFamily: Fonts.regular,
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
    fontFamily: Fonts.title,
    color: Colors.white,
  },
});
