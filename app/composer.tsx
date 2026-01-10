import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image as LucideImage, Camera, X, TestTube, ArrowRight, Upload, Sparkles, Lightbulb, Info, Wand2 } from 'lucide-react-native';
import { useState, useEffect, useRef } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Switch,
  Animated,
  Modal,
} from 'react-native';
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
import { Fonts } from '@/constants/typography';
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';

// Step types for the composer flow
type ComposerStep = 'selecting' | 'uploading' | 'describing' | 'generating';

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

// Reusable full-screen loader component
function FullScreenLoader({ 
  icon: Icon, 
  title, 
  subtitle, 
  progress 
}: { 
  icon: React.ComponentType<any>; 
  title: string; 
  subtitle: string;
  progress?: string;
}) {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    rotateAnim.setValue(0);
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
        isInteraction: false,
      })
    ).start();
  }, [rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={loaderStyles.container}>
      <LinearGradient
        colors={[Colors.black, Colors.grayDark, Colors.black]}
        style={loaderStyles.gradient}
      >
        <Animated.View style={[loaderStyles.iconContainer, { transform: [{ rotate }] }]}>
          <Icon size={60} color={Colors.orange} strokeWidth={2} />
        </Animated.View>
        <Text style={loaderStyles.title}>{title}</Text>
        <Text style={loaderStyles.subtitle}>{subtitle}</Text>
        {progress && (
          <Text style={loaderStyles.progress}>{progress}</Text>
        )}
      </LinearGradient>
    </View>
  );
}

const loaderStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconContainer: {
    marginBottom: 32,
    padding: 24,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.regular,
    color: Colors.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.grayLight,
    textAlign: 'center',
  },
  progress: {
    fontSize: 18,
    fontFamily: Fonts.title,
    color: Colors.orange,
    marginTop: 24,
    textAlign: 'center',
  },
});

// Tips modal component
function TipsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={tipsStyles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={tipsStyles.card}>
          <View style={tipsStyles.header}>
            <Lightbulb size={20} color={Colors.orange} />
            <Text style={tipsStyles.title}>What is a Story?</Text>
          </View>
          <Text style={tipsStyles.text}>
            Your story is the narrative that ties your photos together. Describe what happened, how you felt, and what you want your audience to take away.
          </Text>
          <View style={tipsStyles.bestPractices}>
            <Text style={tipsStyles.practiceItem}>✓ Be specific about places, people, events</Text>
            <Text style={tipsStyles.practiceItem}>✓ Include emotions and takeaways</Text>
            <Text style={tipsStyles.practiceItem}>✓ Keep it conversational (15-30 seconds)</Text>
          </View>
          <TouchableOpacity style={tipsStyles.button} onPress={onClose} activeOpacity={0.7}>
            <Text style={tipsStyles.buttonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const tipsStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.grayDark,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  text: {
    fontSize: 14,
    color: Colors.grayLight,
    lineHeight: 20,
    marginBottom: 16,
  },
  bestPractices: {
    gap: 8,
    marginBottom: 20,
  },
  practiceItem: {
    fontSize: 14,
    color: Colors.white,
    lineHeight: 20,
  },
  button: {
    backgroundColor: Colors.orange,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
});

export default function ComposerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId as any; // Cast to Convex ID type
  const insets = useSafeAreaInsets();
  const { user, userId, syncUserFromBackend } = useApp();
  
  // Step-based state
  const [step, setStep] = useState<ComposerStep>('selecting');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  
  // Form state
  const [prompt, setPrompt] = useState('');
  const [mediaUris, setMediaUris] = useState<{ uri: string; type: 'video' | 'image'; id: string; assetId?: string }[]>([]);
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [isTestRun, setIsTestRun] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  
  // Auto-generate story state
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  
  // Tips modal state
  const [showTips, setShowTips] = useState(false);
  
  // Input ref for autofocus
  const inputRef = useRef<TextInput>(null);
  
  // Fetch current user profile from backend
  const backendUser = useQuery(
    api.users.getCurrentUser,
    userId ? { userId } : "skip"
  );
  
  // Fetch existing project if projectId is provided (for editing drafts)
  const existingProject = useQuery(
    api.tasks.getProject,
    projectId ? { id: projectId } : "skip"
  );
  
  // Convex hooks
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl);
  const createProject = useMutation(api.tasks.createProject);
  const generateScriptOnly = useAction(api.tasks.generateScriptOnly);
  const updateProjectScript = useMutation(api.tasks.updateProjectScript);
  const generateStoryDescription = useAction(api.aiServices.generateStoryDescription);
  
  // Always show onboarding for new projects (not editing drafts)
  useEffect(() => {
    // Show onboarding when not editing an existing project
    if (!projectId) {
      setShowOnboarding(true);
    }
    setOnboardingChecked(true);
  }, [projectId]);
  
  // Sync user profile from backend when loaded
  useEffect(() => {
    if (backendUser && userId) {
      console.log('[composer] Syncing user profile from backend');
      syncUserFromBackend(backendUser);
    }
  }, [backendUser, userId, syncUserFromBackend]);
  
  // Pre-populate form data from existing project (for editing drafts)
  useEffect(() => {
    if (existingProject && !draftLoaded) {
      console.log('[composer] Loading draft project data:', existingProject._id);
      setIsLoadingDraft(true);
      
      // Set prompt from project
      setPrompt(existingProject.prompt || '');
      
      // Convert project file URLs to media URIs format
      if (existingProject.fileUrls && existingProject.fileMetadata) {
        const mediaFromProject = existingProject.fileUrls
          .map((url: string | null, index: number) => {
            if (!url) return null;
            const metadata = existingProject.fileMetadata?.[index];
            const isVideo = metadata?.contentType?.startsWith('video/') ?? false;
            return {
              uri: url,
              type: (isVideo ? 'video' : 'image') as 'video' | 'image',
              id: `draft-${index}-${Date.now()}`,
            };
          })
          .filter((item: { uri: string; type: 'video' | 'image'; id: string } | null): item is { uri: string; type: 'video' | 'image'; id: string } => item !== null);
        
        setMediaUris(mediaFromProject);
        console.log('[composer] Loaded', mediaFromProject.length, 'media files from draft');
        
        // If we have media already, go to describing step
        if (mediaFromProject.length > 0) {
          setStep('describing');
        }
      }
      
      setDraftLoaded(true);
      setIsLoadingDraft(false);
    }
  }, [existingProject, draftLoaded]);
  
  // Auto-focus input when entering describing step
  useEffect(() => {
    if (step === 'describing') {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [step]);

  const handleClose = () => {
    router.back();
  };

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    // Auto-open media picker after dismissing onboarding
    pickMedia();
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const loadingTimeout = setTimeout(() => {
      setIsPickingMedia(true);
    }, 2000);
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos', 'images'],
        allowsMultipleSelection: true,
        quality: 1,
        videoExportPreset: VideoExportPreset.H264_1920x1080,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });

      if (!result.canceled && result.assets.length > 0) {
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
          assetId: asset.assetId ?? undefined,
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
    console.warn('loadSampleMedia: Test mode is enabled but sample assets may not be available.');
    alert('Test mode is enabled in config but sample assets are not available. Please add sample media files or disable test mode.');
  };

  // Proceed from selecting to uploading step
  const handleProceedToUpload = async () => {
    if (mediaUris.length === 0 || !userId) {
      return;
    }
    
    // For drafts with existing media, skip upload and go to describing
    const hasNewMedia = mediaUris.some(m => !m.uri.startsWith('http'));
    if (projectId && existingProject && !hasNewMedia) {
      setStep('describing');
      return;
    }
    
    setStep('uploading');
    setUploadProgress({ current: 0, total: mediaUris.length });
    
    try {
      console.log('=== COMPOSER: Starting upload ===');
      console.log('Media count:', mediaUris.length);
      
      // Upload with progress tracking
      const uploads = await uploadMediaFilesWithProgress(
        generateUploadUrl,
        mediaUris.map(m => ({ uri: m.uri, type: m.type, assetId: m.assetId })),
        (current, total) => setUploadProgress({ current, total })
      );
      
      console.log('Uploads complete:', uploads.length);
      
      // Store uploads for later use
      (window as any).__composerUploads = uploads;
      
      // Move to describing step
      setStep('describing');
    } catch (error) {
      console.error('Error uploading:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
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
        alert(`Failed to upload media: ${errorMessage}`);
      }
      setStep('selecting');
    }
  };

  // Upload media files with progress callback
  const uploadMediaFilesWithProgress = async (
    generateUploadUrl: () => Promise<string>,
    mediaItems: Array<{ uri: string; type: "image" | "video"; assetId?: string }>,
    onProgress: (current: number, total: number) => void
  ) => {
    const uploads = [];
    const total = mediaItems.length;
    
    for (let i = 0; i < mediaItems.length; i++) {
      onProgress(i, total);
      
      // Use the existing uploadMediaFiles for single file
      const result = await uploadMediaFiles(generateUploadUrl, [mediaItems[i]]);
      uploads.push(result[0]);
    }
    
    onProgress(total, total);
    return uploads;
  };

  // Handle auto-generate story
  const handleAutoGenerateStory = async () => {
    if (mediaUris.length === 0) {
      alert('Please select some media first');
      return;
    }
    
    setIsGeneratingStory(true);
    
    try {
      // Get file URLs from uploads or existing project
      let fileUrls: string[] = [];
      
      if (projectId && existingProject?.fileUrls) {
        fileUrls = existingProject.fileUrls.filter((url: string | null): url is string => url !== null);
      } else {
        const uploads = (window as any).__composerUploads;
        if (uploads) {
          // We need to get URLs for the uploaded files
          // For now, use the local URIs as fallback
          fileUrls = mediaUris.map(m => m.uri);
        }
      }
      
      if (fileUrls.length === 0) {
        alert('Please upload your media first');
        setIsGeneratingStory(false);
        return;
      }
      
      console.log('[composer] Auto-generating story from', fileUrls.length, 'files');
      
      const result = await generateStoryDescription({ imageUrls: fileUrls });
      
      if (result.success && result.description) {
        setPrompt(result.description);
      } else {
        alert(result.error || 'Failed to generate story description');
      }
    } catch (error) {
      console.error('[composer] Error auto-generating story:', error);
      alert('Failed to generate story. Please try again or write your own.');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  // Handle final submit - generate script
  const handleGenerateScript = async () => {
    if (!prompt.trim() || !userId) {
      return;
    }

    setStep('generating');

    try {
      console.log('=== COMPOSER: Generating script ===');
      console.log('Test Run Mode:', isTestRun);
      console.log('Prompt:', prompt.trim());
      console.log('Existing project:', projectId || 'none');

      let finalProjectId = projectId;

      if (projectId && existingProject) {
        console.log('[composer] Editing existing draft, regenerating script...');
        
        if (prompt.trim() !== existingProject.prompt) {
          console.log('[composer] Prompt changed, updating...');
          await updateProjectScript({
            id: projectId,
            script: '',
          });
        }
        
        await generateScriptOnly({ projectId });
      } else {
        const uploads = (window as any).__composerUploads;
        if (!uploads || uploads.length === 0) {
          throw new Error('No uploads found. Please go back and upload media.');
        }
        
        finalProjectId = await createProject({
          userId,
          prompt: prompt.trim(),
          files: uploads.map((u: any) => u.storageId),
          fileMetadata: uploads,
          thumbnail: uploads[0].storageId,
        });

        console.log('Project created:', finalProjectId);

        if (ENABLE_TEST_RUN_MODE && isTestRun) {
          console.error('Test run mode requested but sample assets are not available');
          alert('Test mode is enabled but sample assets are not configured. Please disable test mode or add sample assets.');
          setStep('describing');
          return;
        }
        
        console.log('Starting script generation...');
        await generateScriptOnly({ projectId: finalProjectId });
      }

      // Clean up stored uploads
      delete (window as any).__composerUploads;
      
      router.replace({
        pathname: '/script-review',
        params: { projectId: finalProjectId.toString() },
      });
    } catch (error) {
      console.error('Error generating script:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to generate script: ${errorMessage}`);
      setStep('describing');
    }
  };

  const canProceedToUpload = mediaUris.length > 0;
  const canGenerateScript = prompt.trim().length > 0;

  // Show onboarding overlay
  if (showOnboarding && onboardingChecked) {
    return (
      <View style={styles.container}>
        <View style={[styles.onboardingOverlay, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.onboardingCard}>
            <Image 
              source={require('@/assets/images/icon-no-bg.png')} 
              style={styles.onboardingIcon} 
            />
            <Text style={styles.onboardingTitle}>Create Your First Reel</Text>
            <Text style={styles.onboardingSubtitle}>Let AI turn your photos and videos into engaging content</Text>
            
            <View style={styles.onboardingSteps}>
              <View style={styles.onboardingStep}>
                <View style={styles.onboardingStepNumber}><Text style={styles.onboardingStepNumberText}>1</Text></View>
                <Text style={styles.onboardingStepText}>Select 5-6 photos or videos</Text>
              </View>
              <View style={styles.onboardingStep}>
                <View style={styles.onboardingStepNumber}><Text style={styles.onboardingStepNumberText}>2</Text></View>
                <Text style={styles.onboardingStepText}>Describe your story</Text>
              </View>
              <View style={styles.onboardingStep}>
                <View style={styles.onboardingStepNumber}><Text style={styles.onboardingStepNumberText}>3</Text></View>
                <Text style={styles.onboardingStepText}>Revise your generated script</Text>
              </View>
              <View style={styles.onboardingStep}>
                <View style={styles.onboardingStepNumber}><Text style={styles.onboardingStepNumberText}>4</Text></View>
                <Text style={styles.onboardingStepText}>Download ready-to-share video</Text>
              </View>
            </View>
            
            {/* Tips section shown during onboarding */}
            <View style={styles.onboardingTipsCard}>
              <View style={styles.onboardingTipsHeader}>
                <Lightbulb size={16} color={Colors.orange} />
                <Text style={styles.onboardingTipsTitle}>Story Tips</Text>
              </View>
              <Text style={styles.onboardingTipsItem}>✓ Be specific about places, people, events</Text>
              <Text style={styles.onboardingTipsItem}>✓ Include emotions and takeaways</Text>
              <Text style={styles.onboardingTipsItem}>✓ Keep it conversational</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.onboardingButton} 
              onPress={dismissOnboarding}
              activeOpacity={0.8}
            >
              <View style={styles.onboardingButtonInner}>
                <Text style={styles.onboardingButtonText}>Let's Go!</Text>
                <ArrowRight size={20} color={Colors.white} strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Show upload loader
  if (step === 'uploading') {
    const progressText = `${uploadProgress.current}/${uploadProgress.total} files (${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%)`;
    return (
      <FullScreenLoader
        icon={Upload}
        title="Uploading Media"
        subtitle="Please wait while we upload your files..."
        progress={progressText}
      />
    );
  }

  // Show script generation loader
  if (step === 'generating') {
    return (
      <FullScreenLoader
        icon={Sparkles}
        title="Creating Your Script"
        subtitle="Analyzing your media and crafting the perfect story..."
      />
    );
  }

  // Main composer UI (selecting or describing step)
  return (
    <View style={styles.container}>
      <TipsModal visible={showTips} onClose={() => setShowTips(false)} />
      
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <X size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        
        <View style={styles.placeholder} />
        
        {projectId && existingProject?.script ? (
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => {
              router.push({
                pathname: '/script-review',
                params: { projectId: projectId.toString() },
              });
            }}
            activeOpacity={0.7}
          >
            <ArrowRight size={24} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleSection}>
            <Text style={styles.title}>
              {step === 'selecting' 
                ? `Hey, ${user?.name || 'there'}, share your story!`
                : 'Describe your story'
              }
            </Text>
          </View>

          <View style={styles.form}>
            {ENABLE_TEST_RUN_MODE && step === 'selecting' && (
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

            {/* Media selection - shown in selecting step or as preview in describing step */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {step === 'selecting' ? 'Upload Media ' : 'Selected Media '}
                <Text style={styles.labelHint}>({mediaUris.length} files)</Text>
              </Text>
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
                      {step === 'selecting' && (
                        <TouchableOpacity
                          style={styles.removeButton}
                          onPress={() => removeMedia(index)}
                          activeOpacity={0.7}
                        >
                          <X size={16} color={Colors.white} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
              {step === 'selecting' && !isTestRun && (
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

            {/* Description input - shown in describing step */}
            {step === 'describing' && (
              <>
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Describe your story</Text>
                    <TouchableOpacity onPress={() => setShowTips(true)} activeOpacity={0.7}>
                      <Info size={18} color={Colors.grayLight} />
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="Describe your day, event, or experience..."
                    placeholderTextColor={Colors.grayLight}
                    value={prompt}
                    onChangeText={setPrompt}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  
                  {/* Auto-generate story button */}
                  <TouchableOpacity
                    style={[styles.autoGenerateButton, isGeneratingStory && styles.autoGenerateButtonLoading]}
                    onPress={handleAutoGenerateStory}
                    activeOpacity={0.7}
                    disabled={isGeneratingStory}
                  >
                    {isGeneratingStory ? (
                      <>
                        <ActivityIndicator size="small" color={Colors.orange} />
                        <Text style={styles.autoGenerateButtonText}>Generating...</Text>
                      </>
                    ) : (
                      <>
                        <Wand2 size={18} color={Colors.orange} strokeWidth={2} />
                        <Text style={styles.autoGenerateButtonText}>Auto-generate Story</Text>
                      </>
                    )}
                  </TouchableOpacity>
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
              </>
            )}

            {/* Action button */}
            {step === 'selecting' ? (
              <TouchableOpacity
                style={[styles.button, !canProceedToUpload && styles.buttonDisabled]}
                onPress={handleProceedToUpload}
                disabled={!canProceedToUpload}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    canProceedToUpload
                      ? [Colors.orange, Colors.orangeLight]
                      : [Colors.gray, Colors.grayLight]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>Continue</Text>
                  <ArrowRight size={20} color={Colors.white} strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, !canGenerateScript && styles.buttonDisabled]}
                onPress={handleGenerateScript}
                disabled={!canGenerateScript}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    canGenerateScript
                      ? [Colors.orange, Colors.orangeLight]
                      : [Colors.gray, Colors.grayLight]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.buttonText}>Generate Script</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
            
            {/* Back button in describing step */}
            {step === 'describing' && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setStep('selecting')}
                activeOpacity={0.7}
              >
                <Text style={styles.backButtonText}>← Back to Media Selection</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
    backgroundColor: Colors.black,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 40,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  titleSection: {
    marginBottom: 20,
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
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
    fontFamily: Fonts.regular,
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
    fontSize: 17,
    color: Colors.white,
    fontFamily: Fonts.title,
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
  autoGenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  autoGenerateButtonLoading: {
    opacity: 0.7,
  },
  autoGenerateButtonText: {
    fontSize: 15,
    fontFamily: Fonts.title,
    color: Colors.orange,
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
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 17,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  backButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
  },
  // Onboarding styles
  onboardingOverlay: {
    flex: 1,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  onboardingCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  onboardingIcon: {
    width: 80,
    height: 80,
    marginBottom: 24,
  },
  onboardingTitle: {
    fontSize: 28,
    fontFamily: Fonts.title,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  onboardingSubtitle: {
    fontSize: 16,
    color: Colors.grayLight,
    textAlign: 'center',
    marginBottom: 32,
  },
  onboardingSteps: {
    width: '100%',
    gap: 16,
    marginBottom: 24,
  },
  onboardingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  onboardingStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.orange,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onboardingStepNumberText: {
    fontSize: 14,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  onboardingStepText: {
    fontSize: 16,
    color: Colors.white,
    flex: 1,
  },
  onboardingTipsCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  onboardingTipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  onboardingTipsTitle: {
    fontSize: 14,
    fontFamily: Fonts.title,
    color: Colors.orange,
  },
  onboardingTipsItem: {
    fontSize: 13,
    color: Colors.grayLight,
    lineHeight: 20,
    marginBottom: 4,
  },
  onboardingButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  onboardingButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: Colors.orange,
    borderRadius: 12,
  },
  onboardingButtonText: {
    fontSize: 18,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
});
