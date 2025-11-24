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
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';

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
  const markProjectSubmittedTestMode = useMutation(api.tasks.markProjectSubmittedTestMode);
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl);
  const updateProjectRenderMode = useMutation(api.tasks.updateProjectRenderMode);

  // Local state
  const [isEditing, setIsEditing] = useState(false);
  const [editedScript, setEditedScript] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renderMode, setRenderMode] = useState<'remotion' | 'ffmpeg'>('ffmpeg');
  const [lastProjectScript, setLastProjectScript] = useState<string>('');

  // Initialize script and render mode from project
  useEffect(() => {
    if (project?.script) {
      // Update editedScript when project script changes (e.g., after regeneration)
      // But only if we're not currently editing
      if (!isEditing && project.script !== lastProjectScript) {
      // Replace ??? with ? for display
      setEditedScript(project.script.replace(/\?\?\?/g, "?"));
        setLastProjectScript(project.script);
      } else if (!editedScript) {
        // Initial load
        setEditedScript(project.script.replace(/\?\?\?/g, "?"));
        setLastProjectScript(project.script);
      }
    }
    if (project?.renderMode) {
      setRenderMode(project.renderMode);
    }
  }, [project?.script, project?.renderMode, isEditing]);

  const handleSaveEdit = async () => {
    if (!projectId || !editedScript.trim()) {
      Alert.alert('Error', 'Script cannot be empty');
      return;
    }

    try {
      // Replace ? with ??? before saving (but not if it's already ???)
      const scriptToSave = editedScript.trim().replace(/\?(?!\?\?)/g, "???");
      await updateProjectScript({
        id: projectId,
        script: scriptToSave,
      });
      setIsEditing(false);
      Alert.alert('Success', 'Script updated');
    } catch (error) {
      console.error('Update script error:', error);
      Alert.alert('Error', 'Failed to update script');
    }
  };

  const handleCancelEdit = () => {
    // Replace ??? with ? for display
    setEditedScript((project?.script || '').replace(/\?\?\?/g, "?"));
    setIsEditing(false);
  };

  const handleRegenerate = async () => {
    if (!projectId) return;

    setIsRegenerating(true);
    try {
      const result = await regenerateScript({ projectId });
      if (result.success) {
        // The new script will be automatically picked up by the useEffect
        Alert.alert('Success', 'Script has been regenerated!');
      } else {
        throw new Error(result.error || 'Failed to regenerate script');
      }
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

      // Save render mode
      console.log('[script-review] Saving render mode:', renderMode);
      await updateProjectRenderMode({
        id: projectId,
        renderMode,
      });

      // Optimistically update video status to "processing" for instant UI feedback
      console.log('[script-review] Optimistically updating video to processing state...');
      addVideo({
        id: projectId,
        uri: '',
        prompt: project.prompt,
        script: scriptToSave,
        createdAt: project.createdAt || Date.now(),
        status: 'processing',
        projectId: projectId,
        thumbnailUrl: project.thumbnailUrl,
      });

      // For normal mode, mark as submitted and schedule generation server-side
      if (!isTestRun) {
        console.log('[script-review] Marking project as submitted (schedules generation server-side)...');
        await markProjectSubmitted({ id: projectId });
        console.log('[script-review] Media generation scheduled server-side, navigating to feed...');
        router.replace('/feed');
        return; // Exit early - generation continues in background
      }

      // Test run mode: Upload sample assets and schedule test run setup (same pattern as normal mode)
      // ⚠️  TEST MODE: Skips ALL AI generation - uses pre-recorded sample files instead
      console.log('[script-review] ⚠️  TEST RUN MODE: Using sample files from assets/media (NO AI generation)');
      console.log('[script-review] Loading sample assets...');
      
      // Load and upload sample voice (from assets/media/sample_voice.mp3)
      // This replaces AI voice generation
      const sampleVoiceAsset = Asset.fromModule(require('@/assets/media/sample_voice.mp3'));
      await sampleVoiceAsset.downloadAsync();
      console.log('[script-review] Uploading sample voice from assets/media/sample_voice.mp3...');
      const audioStorageId = await uploadFileToConvex(
        generateUploadUrl,
        sampleVoiceAsset.localUri || sampleVoiceAsset.uri,
        'audio/mp3'
      );
      console.log('[script-review] ✓ Sample voice uploaded, storage ID:', audioStorageId);

      // Load and upload sample music (from assets/media/sample_music.mp3)
      const sampleMusicAsset = Asset.fromModule(require('@/assets/media/sample_music.mp3'));
      await sampleMusicAsset.downloadAsync();
      console.log('[script-review] Uploading sample music from assets/media/sample_music.mp3...');
      const musicStorageId = await uploadFileToConvex(
        generateUploadUrl,
        sampleMusicAsset.localUri || sampleMusicAsset.uri,
        'audio/mp3'
      );
      console.log('[script-review] ✓ Sample music uploaded, storage ID:', musicStorageId);

      // Load sample SRT (from assets/media/sample_srt.srt)
      // This replaces AI SRT generation
      const sampleSrtAsset = Asset.fromModule(require('@/assets/media/sample_srt.srt'));
      await sampleSrtAsset.downloadAsync();
      const srtResponse = await fetch(sampleSrtAsset.localUri || sampleSrtAsset.uri);
      const srtContent = await srtResponse.text();
      console.log('[script-review] ✓ Sample SRT loaded from assets/media/sample_srt.srt, length:', srtContent.length);

      // Optimistically update video status to "processing" for instant UI feedback (same as normal mode)
      console.log('[script-review] Optimistically updating video to processing state...');
      addVideo({
        id: projectId,
        uri: '',
        prompt: project.prompt,
        script: scriptToSave,
        createdAt: project.createdAt || Date.now(),
        status: 'processing',
        projectId: projectId,
        thumbnailUrl: project.thumbnailUrl,
      });

      // Mark project as submitted in test mode (schedules test run setup server-side, same pattern as normal mode)
      console.log('[script-review] Marking project as submitted in test mode (schedules setup server-side)...');
      await markProjectSubmittedTestMode({
        id: projectId,
        audioStorageId,
        srtContent,
        musicStorageId,
      });

      console.log('[script-review] Test run scheduled server-side, navigating to feed...');
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

      {ENABLE_TEST_RUN_MODE && isTestRun && (
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
                  <Text style={styles.scriptText}>{editedScript || (project.script ? project.script.replace(/\?\?\?/g, "?") : '')}</Text>
                </View>
              )}
            </View>

            {/* Render Mode Toggle - Commented out for production (defaults to ffmpeg) */}
            {/* <View style={styles.renderModeContainer}>
              <Text style={styles.renderModeLabel}>Rendering Engine:</Text>
              <View style={styles.renderModeToggle}>
                <TouchableOpacity
                  style={[
                    styles.renderModeOption,
                    renderMode === 'remotion' && styles.renderModeOptionActive
                  ]}
                  onPress={() => setRenderMode('remotion')}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.renderModeText,
                    renderMode === 'remotion' && styles.renderModeTextActive
                  ]}>
                    Remotion
                  </Text>
                  <Text style={styles.renderModeDesc}>(Higher quality)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.renderModeOption,
                    renderMode === 'ffmpeg' && styles.renderModeOptionActive
                  ]}
                  onPress={() => setRenderMode('ffmpeg')}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.renderModeText,
                    renderMode === 'ffmpeg' && styles.renderModeTextActive
                  ]}>
                    FFmpeg
                  </Text>
                  <Text style={styles.renderModeDesc}>(Faster)</Text>
                </TouchableOpacity>
              </View>
            </View> */}

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
  renderModeContainer: {
    marginTop: 24,
    gap: 12,
  },
  renderModeLabel: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginBottom: 4,
  },
  renderModeToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  renderModeOption: {
    flex: 1,
    backgroundColor: Colors.grayDark,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  renderModeOptionActive: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  renderModeText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    fontWeight: '600',
    marginBottom: 4,
  },
  renderModeTextActive: {
    color: Colors.orange,
  },
  renderModeDesc: {
    fontSize: 12,
    fontFamily: Fonts.regular,
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

