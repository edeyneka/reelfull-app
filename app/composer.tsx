import { useRouter } from 'expo-router';
import { Image as LucideImage, Camera, X, TestTube } from 'lucide-react-native';
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
import { VideoExportPreset } from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { uploadMediaFiles } from '@/lib/api-helpers';
import { Asset } from 'expo-asset';
import { Fonts } from '@/constants/typography';
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';

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
  const { user, userId, syncUserFromBackend } = useApp();
  const [prompt, setPrompt] = useState('');
  const [mediaUris, setMediaUris] = useState<{ uri: string; type: 'video' | 'image'; id: string; assetId?: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [isTestRun, setIsTestRun] = useState(false);
  
  // Fetch current user profile from backend
  const backendUser = useQuery(
    api.users.getCurrentUser,
    userId ? { userId } : "skip"
  );
  
  // Sync user profile from backend when loaded
  useEffect(() => {
    if (backendUser && userId) {
      console.log('[composer] Syncing user profile from backend');
      syncUserFromBackend(backendUser);
    }
  }, [backendUser, userId, syncUserFromBackend]);
  
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

    // Show loading indicator after 2 seconds (for iCloud downloads)
    const loadingTimeout = setTimeout(() => {
      setIsPickingMedia(true);
    }, 2000);
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos', 'images'],
        allowsMultipleSelection: true,
        quality: 1,
        // Force video export/transcoding - this triggers iCloud download for optimized storage videos
        videoExportPreset: VideoExportPreset.H264_1920x1080,
        // Request compatible format which also helps with iCloud files
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });

      if (!result.canceled && result.assets.length > 0) {
        // Log detailed asset info for debugging iCloud issues
        console.log('[pickMedia] Selected assets:', result.assets.map(asset => ({
          uri: asset.uri.substring(0, 80) + '...',
          type: asset.type,
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
          fileSize: asset.fileSize,
          assetId: asset.assetId,
        })));
        
        const newMedia = result.assets.map(asset => ({
          uri: asset.uri,
          type: (asset.type === 'video' ? 'video' : 'image') as 'video' | 'image',
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          assetId: asset.assetId ?? undefined, // Pass assetId for iCloud file handling (convert null to undefined)
        }));
        setMediaUris(prev => [...prev, ...newMedia]);
      }
    } finally {
      clearTimeout(loadingTimeout);
      setIsPickingMedia(false);
    }
  };

  const removeMedia = (index: number) => {
    setMediaUris(prev => prev.filter((_, i) => i !== index));
  };

  const loadSampleMedia = async () => {
    if (!ENABLE_TEST_RUN_MODE) {
      console.warn('loadSampleMedia called but ENABLE_TEST_RUN_MODE is disabled');
      return;
    }
    
    // When ENABLE_TEST_RUN_MODE is false, this function should never be called
    // and the assets don't need to exist
    console.warn('loadSampleMedia: Test mode is enabled but sample assets may not be available.');
    alert('Test mode is enabled in config but sample assets are not available. Please add sample media files or disable test mode.');
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || mediaUris.length === 0 || !userId) {
      return;
    }

    // Show info alert
    alert('Please wait until the script is generated to approve it');

    setIsUploading(true);

    try {
      console.log('=== COMPOSER: Starting upload ===');
      console.log('Test Run Mode:', isTestRun);
      console.log('Prompt:', prompt.trim());
      console.log('Media count:', mediaUris.length);

      // Upload all media files to Convex
      const uploads = await uploadMediaFiles(
        generateUploadUrl,
        mediaUris.map(m => ({ uri: m.uri, type: m.type, assetId: m.assetId }))
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

      if (ENABLE_TEST_RUN_MODE && isTestRun) {
        // Test run mode: Sample assets required but not available in this build
        console.error('Test run mode requested but sample assets are not available');
        alert('Test mode is enabled but sample assets are not configured. Please disable test mode or add sample assets.');
        return;
      }
      
      // Normal mode: Start script generation
      console.log('Starting script generation...');
      await generateScriptOnly({ projectId });

      // Navigate to script review
      router.replace({
        pathname: '/script-review',
        params: { projectId: projectId.toString() },
      });
    } catch (error) {
      console.error('Error in composer:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Provide user-friendly message for iCloud-related issues
      if (
        errorMessage.includes('iCloud') || 
        errorMessage.includes('downloading') ||
        errorMessage.includes('PHPhotos') ||
        errorMessage.includes('3164') ||
        errorMessage.includes('operation couldn\'t be completed')
      ) {
        alert(
          'iCloud Video Not Available\n\n' +
          'One or more videos are stored in iCloud and need to be downloaded first.\n\n' +
          'To fix this:\n' +
          '1. Open the Photos app\n' +
          '2. Find the video(s) you want to use\n' +
          '3. Wait for them to fully download (the cloud icon should disappear)\n' +
          '4. Come back and try again'
        );
      } else {
        alert(`Failed to create project: ${errorMessage}`);
      }
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
              {ENABLE_TEST_RUN_MODE && (
                <>
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
                </>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Upload Media <Text style={styles.labelHint}>(optimal: 5-6 files)</Text></Text>
                {mediaUris.length > 0 && (
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.mediaScroll}
                    contentContainerStyle={styles.mediaScrollContent}
                  >
                    {mediaUris.map((media, index) => (
                      <View key={media.id} style={styles.mediaPreview}>
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
                  <>
                    <TouchableOpacity
                      style={[styles.pickerButton, isPickingMedia && styles.pickerButtonLoading]}
                      onPress={pickMedia}
                      activeOpacity={0.7}
                      disabled={isPickingMedia}
                    >
                      {isPickingMedia ? (
                        <>
                          <ActivityIndicator size="small" color={Colors.white} />
                          <Text style={styles.pickerButtonText}>Loading media...</Text>
                        </>
                      ) : (
                        <>
                          <Camera size={20} color={Colors.white} strokeWidth={2} />
                          <Text style={styles.pickerButtonText}>
                            {mediaUris.length > 0 ? 'Add More Media' : 'Select Photos/Videos'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.iCloudHint}>
                      ☁️ Videos stored in iCloud may take a moment to load
                    </Text>
                  </>
                )}
              </View>

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
                    <View style={styles.buttonLoadingContent}>
                      <ActivityIndicator size="small" color={Colors.white} />
                      <Text style={styles.buttonText}>Generating Script...</Text>
                    </View>
                  ) : (
                    <Text style={styles.buttonText}>Generate Script</Text>
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
    fontSize: 24,
    fontFamily: Fonts.regular,
    color: Colors.white,
    lineHeight: 32,
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
  labelHint: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
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
  pickerButton: {
    backgroundColor: Colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pickerButtonLoading: {
    opacity: 0.8,
  },
  pickerButtonText: {
    fontSize: 16,
    color: Colors.white,
    fontFamily: Fonts.regular,
  },
  iCloudHint: {
    fontSize: 12,
    color: Colors.grayLight,
    textAlign: 'center',
    marginTop: 8,
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
  buttonLoadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 17,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
});
