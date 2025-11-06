import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Edit2, Check, X, RotateCcw, Play, TestTube } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { Asset } from 'expo-asset';
import { uploadFileToConvex } from '@/lib/api-helpers';
import { Fonts } from '@/constants/typography';

export default function ScriptReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ projectId: string; testRun?: string }>();
  const projectId = params.projectId as any;
  const isTestRun = params.testRun === 'true';
  const { addVideo } = useApp();

  // Convex hooks
  const project = useQuery(api.tasks.getProject, projectId ? { id: projectId } : "skip");
  const updateProjectScript = useMutation(api.tasks.updateProjectScript);
  const regenerateScript = useAction(api.tasks.regenerateScript);
  const markProjectSubmitted = useMutation(api.tasks.markProjectSubmitted);
  const generateMediaAssets = useAction(api.tasks.generateMediaAssets);
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl);
  const setupTestRunProject = useAction(api.tasks.setupTestRunProject);

  // Local state
  const [isEditing, setIsEditing] = useState(false);
  const [editedScript, setEditedScript] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize script from project
  useEffect(() => {
    if (project?.script && !editedScript) {
      setEditedScript(project.script);
    }
  }, [project?.script]);

  const handleSaveEdit = async () => {
    if (!projectId || !editedScript.trim()) {
      Alert.alert('Error', 'Script cannot be empty');
      return;
    }

    try {
      await updateProjectScript({
        id: projectId,
        script: editedScript.trim(),
      });
      setIsEditing(false);
      Alert.alert('Success', 'Script updated');
    } catch (error) {
      console.error('Update script error:', error);
      Alert.alert('Error', 'Failed to update script');
    }
  };

  const handleCancelEdit = () => {
    setEditedScript(project?.script || '');
    setIsEditing(false);
  };

  const handleRegenerate = async () => {
    if (!projectId) return;

    setIsRegenerating(true);
    try {
      await regenerateScript({ projectId });
      Alert.alert('Success', 'New script is being generated');
    } catch (error) {
      console.error('Regenerate script error:', error);
      Alert.alert('Error', 'Failed to regenerate script');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!projectId || !project?.script) {
      Alert.alert('Error', 'No script available');
      return;
    }

    setIsSubmitting(true);
    try {
      // Save any edits (replace ? with ??? before saving, matching studio behavior)
      const scriptToSave = editedScript !== project.script 
        ? editedScript.trim().replace(/\?(?!\?\?)/g, "???")
        : project.script.replace(/\?(?!\?\?)/g, "???");
      
      if (editedScript !== project.script || scriptToSave !== project.script) {
        console.log('[script-review] Saving edited script...');
        await updateProjectScript({
          id: projectId,
          script: scriptToSave,
        });
      }

      // Mark as submitted (sets submittedAt timestamp)
      console.log('[script-review] Marking project as submitted...');
      await markProjectSubmitted({ id: projectId });

      // Create a pending video entry in the feed
      console.log('[script-review] Adding pending video to feed...');
      await addVideo({
        id: projectId,
        uri: '', // Empty until video is ready
        prompt: project.prompt,
        createdAt: Date.now(),
        status: 'pending',
        projectId: projectId,
      });

      if (isTestRun) {
        // Test run mode: Upload sample voice, music, and SRT, skip AI generation
        console.log('[script-review] Test run mode: Loading sample assets...');
        
        // Load and upload sample voice
        const sampleVoiceAsset = Asset.fromModule(require('@/assets/media/sample_voice.mp3'));
        await sampleVoiceAsset.downloadAsync();
        console.log('[script-review] Uploading sample voice...');
        const audioStorageId = await uploadFileToConvex(
          generateUploadUrl,
          sampleVoiceAsset.localUri || sampleVoiceAsset.uri,
          'audio/mp3'
        );
        console.log('[script-review] Sample voice uploaded, storage ID:', audioStorageId);

        // Load and upload sample music
        const sampleMusicAsset = Asset.fromModule(require('@/assets/media/sample_music.mp3'));
        await sampleMusicAsset.downloadAsync();
        console.log('[script-review] Uploading sample music...');
        const musicStorageId = await uploadFileToConvex(
          generateUploadUrl,
          sampleMusicAsset.localUri || sampleMusicAsset.uri,
          'audio/mp3'
        );
        console.log('[script-review] Sample music uploaded, storage ID:', musicStorageId);

        // Load sample SRT
        const sampleSrtAsset = Asset.fromModule(require('@/assets/media/sample_srt.srt'));
        await sampleSrtAsset.downloadAsync();
        const srtResponse = await fetch(sampleSrtAsset.localUri || sampleSrtAsset.uri);
        const srtContent = await srtResponse.text();
        console.log('[script-review] Sample SRT loaded, length:', srtContent.length);

        // Setup test run project with sample assets
        console.log('[script-review] Setting up test run project...');
        const result = await setupTestRunProject({
          projectId,
          audioStorageId,
          srtContent,
          musicStorageId,
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to setup test run');
        }

        console.log('[script-review] Test run setup complete! Rendering will start automatically.');
      } else {
        // Normal mode: Start media generation (Phase 2: voice, music, animations) - async in background
        console.log('[script-review] Starting media asset generation...');
        generateMediaAssets({ projectId }).catch((error) => {
          console.error('[script-review] Media generation error:', error);
          // Don't block navigation - the error will be reflected in project status
        });
      }

      // Navigate to feed immediately
      console.log('[script-review] Navigating to feed...');
      router.replace('/feed');
    } catch (error) {
      console.error('[script-review] Approve error:', error);
      Alert.alert('Error', `Failed to start generation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsSubmitting(false);
    }
  };

  if (!projectId) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Script Review</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>No project ID</Text>
        </View>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Script Review</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.orange} />
        </View>
      </View>
    );
  }

  const hasScript = !!project.script;
  const isLoadingScript = project.status === 'processing' && !hasScript;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={24} color={Colors.white} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Script</Text>
        <View style={styles.placeholder} />
      </View>

      {isTestRun && (
        <View style={styles.testModeBadge}>
          <TestTube size={14} color={Colors.orange} />
          <Text style={styles.testModeText}>Test Run Mode</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isLoadingScript ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.orange} />
            <Text style={styles.loadingText}>Generating script...</Text>
          </View>
        ) : hasScript ? (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Generated Script</Text>
                {!isEditing && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => setIsEditing(true)}
                      activeOpacity={0.7}
                    >
                      <Edit2 size={18} color={Colors.orange} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleRegenerate}
                      activeOpacity={0.7}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? (
                        <ActivityIndicator size="small" color={Colors.orange} />
                      ) : (
                        <RotateCcw size={18} color={Colors.orange} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {isEditing ? (
                <View style={styles.editingContainer}>
                  <TextInput
                    style={styles.scriptInput}
                    value={editedScript}
                    onChangeText={setEditedScript}
                    multiline
                    textAlignVertical="top"
                    placeholder="Enter script..."
                    placeholderTextColor={Colors.grayLight}
                    autoFocus
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={handleSaveEdit}
                      activeOpacity={0.7}
                    >
                      <Check size={18} color={Colors.white} strokeWidth={2} />
                      <Text style={styles.editButtonText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleCancelEdit}
                      activeOpacity={0.7}
                    >
                      <X size={18} color={Colors.grayLight} strokeWidth={2} />
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.scriptContainer}>
                  <Text style={styles.scriptText}>{editedScript || project.script}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.approveButton, isSubmitting && styles.approveButtonDisabled]}
              onPress={handleApprove}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  isSubmitting
                    ? [Colors.gray, Colors.grayLight]
                    : [Colors.orange, Colors.orangeLight]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.approveButtonGradient}
              >
                {isSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color={Colors.white} />
                    <Text style={styles.approveButtonText}>Starting...</Text>
                  </>
                ) : (
                  <>
                    <Play size={20} color={Colors.white} strokeWidth={2.5} />
                    <Text style={styles.approveButtonText}>Approve & Generate</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>No script available</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRegenerate}
              activeOpacity={0.7}
            >
              <Text style={styles.retryButtonText}>Generate Script</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    paddingBottom: 16,
    backgroundColor: Colors.black,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  placeholder: {
    width: 40,
  },
  content: {
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.grayLight,
    fontSize: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scriptContainer: {
    backgroundColor: Colors.grayDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  scriptText: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.white,
  },
  editingContainer: {
    gap: 12,
  },
  scriptInput: {
    backgroundColor: Colors.grayDark,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 2,
    borderColor: Colors.orange,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.orange,
    borderRadius: 12,
    padding: 16,
  },
  editButtonText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 16,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.grayLight,
  },
  approveButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 24,
  },
  approveButtonDisabled: {
    opacity: 0.5,
  },
  approveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 18,
  },
  approveButtonText: {
    fontSize: 18,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  errorContainer: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 40,
  },
  errorText: {
    fontSize: 16,
    color: Colors.grayLight,
  },
  retryButton: {
    backgroundColor: Colors.orange,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  testModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 24,
    marginTop: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  testModeText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.orange,
  },
});

