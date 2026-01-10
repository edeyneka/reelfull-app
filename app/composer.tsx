import { useRouter, useLocalSearchParams } from 'expo-router';
import { Camera, X, ArrowRight, Info, Plus } from 'lucide-react-native';
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

// Step types for the composer flow
type ComposerStep = 'media_selection' | 'description';

function VideoThumbnail({ uri, style }: { uri: string; style: any }) {
  const player = useVideoPlayer(uri, (player) => {
    player.muted = true;
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

// Overlay loader component (fully opaque to hide content behind)
function OverlayLoader({ 
  title, 
  subtitle, 
  showWarning = false,
  progress,
  preparing = false,
}: { 
  title: string; 
  subtitle?: string;
  showWarning?: boolean;
  progress?: { current: number; total: number };
  preparing?: boolean; // Show 0% while preparing (iCloud download)
}) {
  const percent = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  
  return (
    <View style={styles.overlayLoader}>
      <View style={styles.loaderContent}>
        <ActivityIndicator size="large" color={Colors.orange} />
        <Text style={styles.loaderTitle}>{title}</Text>
        {preparing ? (
          <Text style={styles.loaderProgress}>Preparing... (0%)</Text>
        ) : progress ? (
          <Text style={styles.loaderProgress}>
            {progress.current}/{progress.total} files ({percent}%)
          </Text>
        ) : null}
        {subtitle && <Text style={styles.loaderSubtitle}>{subtitle}</Text>}
        {showWarning && (
          <Text style={styles.loaderWarning}>Please don't leave the app</Text>
        )}
      </View>
    </View>
  );
}

export default function ComposerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = params.projectId as any;
  const insets = useSafeAreaInsets();
  const { user, userId, syncUserFromBackend } = useApp();
  
  // Step-based state
  const [step, setStep] = useState<ComposerStep>('media_selection');
  const [prompt, setPrompt] = useState('');
  const [mediaUris, setMediaUris] = useState<{ 
    uri: string; 
    type: 'video' | 'image'; 
    id: string; 
    assetId?: string;
    storageId?: any; // Set after upload
    uploadedUrl?: string; // URL from Convex storage
  }[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showUploadOverlay, setShowUploadOverlay] = useState(false);
  const [showGeneratingOverlay, setShowGeneratingOverlay] = useState(false);
  
  // Track if picker was auto-opened
  const hasAutoOpenedPicker = useRef(false);
  const textInputRef = useRef<TextInput>(null);
  
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
              storageId: metadata?.storageId, // Already uploaded
              uploadedUrl: url, // Already has URL
            };
          })
          .filter((item: any): item is typeof mediaUris[0] => item !== null);
        
        setMediaUris(mediaFromProject);
        console.log('[composer] Loaded', mediaFromProject.length, 'media files from draft');
        
        // If we have media, go straight to description step
        if (mediaFromProject.length > 0) {
          setStep('description');
        }
      }
      
      setDraftLoaded(true);
    }
  }, [existingProject, draftLoaded]);
  
  // Convex hooks
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl);
  const createProject = useMutation(api.tasks.createProject);
  const generateScriptOnly = useAction(api.tasks.generateScriptOnly);

  // Auto-open media picker on first visit (Step 1)
  useEffect(() => {
    if (step === 'media_selection' && !hasAutoOpenedPicker.current && !projectId && !draftLoaded) {
      hasAutoOpenedPicker.current = true;
      // Small delay to ensure component is mounted
      const timer = setTimeout(() => {
        pickMedia();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [step, projectId, draftLoaded]);
  
  // Auto-focus text input when entering description step
  useEffect(() => {
    if (step === 'description') {
      const timer = setTimeout(() => {
        textInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleClose = async () => {
    // Save draft if we have any data
    if (mediaUris.length > 0 || prompt.trim()) {
      await saveDraft();
    }
    router.back();
  };

  const saveDraft = async () => {
    if (!userId) return;
    
    try {
      // Get uploaded files from mediaUris
      const uploadedMedia = mediaUris.filter(m => m.storageId);
      
      if (uploadedMedia.length > 0) {
        console.log('[composer] Saving draft with uploaded files...');
        const fileMetadata = uploadedMedia.map(m => ({
          storageId: m.storageId,
          filename: `${m.type}_${m.id}.${m.type === 'video' ? 'mp4' : 'jpg'}`,
          contentType: m.type === 'video' ? 'video/mp4' : 'image/jpeg',
          size: 0, // Size not tracked after upload
        }));
        
        const draftProjectId = await createProject({
          userId,
          prompt: prompt.trim() || 'Draft',
          files: uploadedMedia.map(m => m.storageId),
          fileMetadata,
          thumbnail: uploadedMedia[0]?.storageId,
        });
        console.log('[composer] Draft saved:', draftProjectId);
      }
    } catch (error) {
      console.error('[composer] Failed to save draft:', error);
    }
  };

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
        videoExportPreset: VideoExportPreset.H264_1920x1080,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });

      clearTimeout(loadingTimeout);
      setIsPickingMedia(false);

      if (!result.canceled && result.assets.length > 0) {
        console.log('[pickMedia] Selected assets:', result.assets.length);
        
        // Show overlay immediately
        setShowUploadOverlay(true);
        
        const newMedia = result.assets.map(asset => ({
          uri: asset.uri,
          type: (asset.type === 'video' ? 'video' : 'image') as 'video' | 'image',
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          assetId: asset.assetId ?? undefined,
        }));
        
        const allMedia = [...mediaUris, ...newMedia];
        setMediaUris(allMedia);
        
        // Start uploading (only new files)
        await startUpload(allMedia, newMedia);
      }
    } catch (error) {
      clearTimeout(loadingTimeout);
      setIsPickingMedia(false);
      setShowUploadOverlay(false);
      throw error;
    }
  };

  const startUpload = async (allMedia: typeof mediaUris, newMediaOnly?: typeof mediaUris) => {
    // Only upload files that don't have a storageId yet
    const filesToUpload = newMediaOnly || allMedia.filter(m => !m.storageId);
    
    if (filesToUpload.length === 0) {
      // All files already uploaded, go to description
      setShowUploadOverlay(false);
      setStep('description');
      return;
    }
    
    setUploadProgress({ current: 0, total: filesToUpload.length });
    
    try {
      console.log('[composer] Starting upload of', filesToUpload.length, 'new files');
      
      // Upload files one by one to track progress
      const updatedMedia = [...allMedia];
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i];
        setUploadProgress({ current: i, total: filesToUpload.length });
        
        // Skip if already uploaded
        if (item.storageId) {
          continue;
        }
        
        try {
          const uploadResult = await uploadMediaFiles(
            generateUploadUrl,
            [{ uri: item.uri, type: item.type, assetId: item.assetId }]
          );
          
          // Update the media item with storageId
          const mediaIndex = updatedMedia.findIndex(m => m.id === item.id);
          if (mediaIndex !== -1 && uploadResult[0]) {
            updatedMedia[mediaIndex] = {
              ...updatedMedia[mediaIndex],
              storageId: uploadResult[0].storageId,
            };
          }
        } catch (error) {
          console.error('[composer] Failed to upload file', i, error);
          throw error;
        }
      }
      
      setUploadProgress({ current: filesToUpload.length, total: filesToUpload.length });
      setMediaUris(updatedMedia);
      
      console.log('[composer] Upload complete:', filesToUpload.length, 'files');
      
      // Hide overlay and move to description step
      setShowUploadOverlay(false);
      setStep('description');
    } catch (error) {
      console.error('[composer] Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setShowUploadOverlay(false);
      
      // Handle iCloud errors
      if (
        errorMessage.includes('iCloud') || 
        errorMessage.includes('downloading') ||
        errorMessage.includes('PHPhotos') ||
        errorMessage.includes('3164')
      ) {
        Alert.alert(
          'iCloud Video Not Available',
          'One or more videos are stored in iCloud and need to be downloaded first.\n\nTo fix this:\n1. Open the Photos app\n2. Find the video(s) you want to use\n3. Wait for them to fully download\n4. Come back and try again'
        );
      } else {
        Alert.alert('Upload Failed', errorMessage);
      }
      
      // Stay on current step (don't reset)
      if (step === 'media_selection') {
        // Already on media selection
      } else {
        // Stay on description step if we were adding more
      }
    }
  };

  const removeMedia = (index: number) => {
    setMediaUris(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddMoreMedia = () => {
    pickMedia();
  };

  const handleSubmit = async () => {
    const uploadedMedia = mediaUris.filter(m => m.storageId);
    
    if (!prompt.trim() || uploadedMedia.length === 0 || !userId) {
      return;
    }

    setShowGeneratingOverlay(true);

    try {
      console.log('[composer] Creating project and generating script...');

      let finalProjectId = projectId;

      if (projectId && existingProject) {
        // Editing existing draft - regenerate script
        console.log('[composer] Regenerating script for existing draft...');
        await generateScriptOnly({ projectId });
      } else {
        // New project - build file metadata from uploaded media
        const fileMetadata = uploadedMedia.map(m => ({
          storageId: m.storageId,
          filename: `${m.type}_${m.id}.${m.type === 'video' ? 'mp4' : 'jpg'}`,
          contentType: m.type === 'video' ? 'video/mp4' : 'image/jpeg',
          size: 0,
        }));
        
        finalProjectId = await createProject({
          userId,
          prompt: prompt.trim(),
          files: uploadedMedia.map(m => m.storageId),
          fileMetadata,
          thumbnail: uploadedMedia[0].storageId,
        });

        console.log('[composer] Project created:', finalProjectId);
        
        // Generate script
        await generateScriptOnly({ projectId: finalProjectId });
      }

      setShowGeneratingOverlay(false);
      
      // Navigate to script review
      router.replace({
        pathname: '/script-review',
        params: { projectId: finalProjectId.toString() },
      });
    } catch (error) {
      console.error('[composer] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to generate script: ${errorMessage}`);
      setShowGeneratingOverlay(false);
    }
  };

  const uploadedMedia = mediaUris.filter(m => m.storageId);
  const isValid = prompt.trim().length > 0 && uploadedMedia.length > 0;

  // Render based on current step
  const renderContent = () => {
    switch (step) {
      case 'media_selection':
        return (
          <View style={styles.mediaSelectionContainer}>
            <Text style={styles.title}>
              Hey, {user?.name || 'there'}, share your story!
            </Text>
            
            <View style={styles.emptyMediaContainer}>
              <TouchableOpacity
                style={[styles.pickerButton, styles.pickerButtonLarge, isPickingMedia && styles.buttonDisabled]}
                onPress={pickMedia}
                activeOpacity={0.7}
                disabled={isPickingMedia}
              >
                <Camera size={24} color={Colors.white} strokeWidth={2} />
                <Text style={styles.pickerButtonText}>Select Photos/Videos</Text>
              </TouchableOpacity>
              <Text style={styles.optimalHint}>Optimal: 5-6 files</Text>
            </View>
          </View>
        );
        
      case 'description':
        return (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Media Preview */}
              <View style={styles.mediaPreviewSection}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mediaScrollContent}
                >
                  {mediaUris.map((media, index) => (
                    <View key={media.id} style={styles.mediaPreviewSmall}>
                      {media.type === 'video' ? (
                        <VideoThumbnail uri={media.uri} style={styles.mediaThumbnailSmall} />
                      ) : (
                        <Image source={{ uri: media.uri }} style={styles.mediaThumbnailSmall} />
                      )}
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addMoreButton}
                    onPress={handleAddMoreMedia}
                    activeOpacity={0.7}
                  >
                    <Plus size={24} color={Colors.grayLight} strokeWidth={2} />
                  </TouchableOpacity>
                </ScrollView>
              </View>
              
              {/* Description Input */}
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Describe Your Story</Text>
                  <TouchableOpacity
                    onPress={() => setShowHint(!showHint)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Info size={16} color={Colors.grayLight} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                
                {showHint && (
                  <View style={styles.hintBubble}>
                    <Text style={styles.hintText}>
                      Your story is the narrative that ties your photos together. Describe what happened, how you felt, and what you want your audience to take away.
                    </Text>
                  </View>
                )}
                
                <TextInput
                  ref={textInputRef}
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
              
              {/* Example Story */}
              <View style={styles.exampleContainer}>
                <View style={styles.exampleHeader}>
                  <Text style={styles.exampleTitle}>Example Story</Text>
                </View>
                <Text style={styles.exampleText}>
                  "I went to the a16z Tech Week in SF - met inspiring founders and caught up with old friends. The focus was on pre-seed fundraising. My three main takeaways: storytelling wins, community opens doors, and clarity beats buzzwords."
                </Text>
              </View>
              
              {/* Generate Script Button */}
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
                  <Text style={styles.buttonText}>Generate Script</Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        );
        
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header - always visible */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <X size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        
        <View style={styles.placeholder} />
        
        {/* Forward arrow - show when editing a draft that has a script */}
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

      {renderContent()}
      
      {/* Unified Upload Overlay (covers iCloud download + server upload) */}
      {(isPickingMedia || showUploadOverlay) && (
        <OverlayLoader
          title="Uploading..."
          preparing={isPickingMedia && !showUploadOverlay}
          progress={showUploadOverlay ? uploadProgress : undefined}
          showWarning={true}
        />
      )}
      
      {/* Generating Script Overlay */}
      {showGeneratingOverlay && (
        <OverlayLoader
          title="Generating your script..."
          subtitle="You'll review it on the next screen"
          showWarning={true}
        />
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
  
  // Media Selection Step
  mediaSelectionContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.regular,
    color: Colors.white,
    lineHeight: 32,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyMediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  pickerButtonLarge: {
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  pickerButtonText: {
    fontSize: 17,
    color: Colors.white,
    fontFamily: Fonts.title,
  },
  optimalHint: {
    fontSize: 14,
    color: Colors.grayLight,
    marginTop: 12,
    fontFamily: Fonts.regular,
  },
  mediaScrollContent: {
    gap: 10,
  },
  
  // Full Screen Loader
  // Overlay Loader
  overlayLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.black, // Fully opaque to show empty state behind
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loaderContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loaderTitle: {
    fontSize: 20,
    fontFamily: Fonts.title,
    color: Colors.white,
    marginTop: 20,
  },
  loaderProgress: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginTop: 8,
  },
  loaderSubtitle: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginTop: 8,
  },
  loaderWarning: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.orange,
    marginTop: 16,
  },
  
  // Description Step
  mediaPreviewSection: {
    marginBottom: 20,
  },
  mediaPreviewSmall: {
    borderRadius: 8,
    overflow: 'hidden',
    width: 60,
    height: 60,
    backgroundColor: Colors.gray,
  },
  mediaThumbnailSmall: {
    width: '100%',
    height: '100%',
  },
  addMoreButton: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.grayLight,
    borderStyle: 'dashed',
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  label: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  hintBubble: {
    backgroundColor: Colors.gray,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.orange,
  },
  hintText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    lineHeight: 18,
  },
  input: {
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.white,
    borderWidth: 2,
    borderColor: 'transparent',
    minHeight: 100,
    fontFamily: Fonts.regular,
  },
  exampleContainer: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  exampleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  exampleTitle: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.orange,
  },
  exampleText: {
    fontSize: 11,
    color: Colors.grayLight,
    lineHeight: 16,
    fontStyle: 'italic' as const,
    fontFamily: Fonts.regular,
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
