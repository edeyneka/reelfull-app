import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Send, X, Check, Info, Copy, MessageSquare, Volume2, Mic, Gauge, ListOrdered, MoreHorizontal, VolumeX } from 'lucide-react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  Keyboard,
  Pressable,
  Animated,
  ActionSheetIOS,
  InteractionManager,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoExportPreset } from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useMutation, useAction, useQuery, useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { uploadMediaFiles } from '@/lib/api-helpers';
import { Fonts } from '@/constants/typography';
import { LocalChatMessage } from '@/types';
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';
import VoiceConfigModal from '@/components/VoiceConfigModal';
import ChatOnboarding, { SpotlightRect } from '@/components/ChatOnboarding';

const MAX_USER_MESSAGES = 10;
const SCRIPT_LOADING_PHRASES = [
  "Generating script",
  "Composing your story",
  "Wow, what a twist",
  "Your content creator era begins here",
  "Threading your clips into a narrative",
  "Finding the strongest hook",
  "Turning moments into a scroll-stopper",
  "Polishing your plotline",
  "Building your binge-worthy draft",
  "Syncing vibe, voice, and visuals",
  "Cooking up your next viral cut",
];

// Voice speed options
const VOICE_SPEED_OPTIONS = [
  { label: 'Slow', value: 1.0 },
  { label: 'Normal', value: 1.08 },
  { label: 'Fast', value: 1.15 },
  { label: 'Very Fast', value: 1.25 },
];

// Generate a consistent 13-digit numeric ID for media files.
// Ensures all batches produce the same length IDs regardless of timing.
function generateMediaTimestamp(): number {
  const ts = Date.now();
  // Ensure exactly 13 digits: pad with trailing zeros if too short, truncate if too long
  const str = ts.toString();
  if (str.length === 13) return ts;
  if (str.length < 13) return parseInt(str.padEnd(13, '0'), 10);
  return parseInt(str.slice(0, 13), 10);
}

// Extended media type with upload status for inline attachments
interface PendingMedia {
  uri: string;
  type: 'image' | 'video';
  id: string;
  assetId?: string;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
  storageId?: any;
  thumbnailLoaded?: boolean; // Track if thumbnail has finished loading
}

// Video thumbnail component
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

// Typing indicator with animated dots
function TypingIndicator() {
  const [dotCount, setDotCount] = useState(1);
  const [phrase, setPhrase] = useState(SCRIPT_LOADING_PHRASES[0]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount(prev => prev >= 3 ? 1 : prev + 1);
    }, 300);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let phraseInterval: ReturnType<typeof setInterval> | null = null;
    const firstRotationTimeout = setTimeout(() => {
      setPhrase((currentPhrase) => {
        const candidates = SCRIPT_LOADING_PHRASES.slice(1).filter((p) => p !== currentPhrase);
        return candidates[Math.floor(Math.random() * candidates.length)] || SCRIPT_LOADING_PHRASES[0];
      });
      phraseInterval = setInterval(() => {
        setPhrase((currentPhrase) => {
          const candidates = SCRIPT_LOADING_PHRASES.slice(1).filter((p) => p !== currentPhrase);
          return candidates[Math.floor(Math.random() * candidates.length)] || SCRIPT_LOADING_PHRASES[0];
        });
      }, 2800);
    }, 3200);

    return () => {
      clearTimeout(firstRotationTimeout);
      if (phraseInterval) {
        clearInterval(phraseInterval);
      }
    };
  }, []);
  
  const dots = '.'.repeat(dotCount);
  // Always reserve space for the maximum 3 dots to prevent text reflow
  const estimatedBubbleWidth = (phrase.length + 3) * 6.1 + 15;
  
  return (
    <View style={[styles.scriptLoadingContainer, { width: estimatedBubbleWidth }]}>
      <Text style={styles.scriptLoadingText} numberOfLines={1}>
        {phrase}
        <Text style={styles.scriptLoadingDots}>{dots}</Text>
      </Text>
    </View>
  );
}

// Chat message bubble component
function ChatBubble({ 
  message, 
  onEditTap, 
  onCopy,
  isLatestAssistant,
  isCopied,
  onPlayVoice,
  isPlayingVoice,
  isGeneratingVoice,
}: { 
  message: LocalChatMessage;
  onEditTap?: () => void;
  onCopy?: () => void;
  isLatestAssistant: boolean;
  isCopied?: boolean;
  onPlayVoice?: () => void;
  isPlayingVoice?: boolean;
  isGeneratingVoice?: boolean;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  return (
    <View style={[styles.messageBubbleContainer, isUser && styles.messageBubbleContainerUser]}>
      {/* Media display for user messages */}
      {message.mediaUris && message.mediaUris.length > 0 && (
        <View style={[styles.messageMediaGrid, isUser && styles.messageMediaGridUser]}>
          {message.mediaUris.map((media, index) => (
            <View key={index} style={styles.messageMediaItem}>
              {media.type === 'video' ? (
                <VideoThumbnail uri={media.uri} style={styles.messageMediaImage} />
              ) : (
                <Image source={{ uri: media.uri }} style={styles.messageMediaImage} />
              )}
            </View>
          ))}
        </View>
      )}
      
      {/* Message content */}
      {(message.content || message.isLoading) && (
        <Pressable 
          style={[
            styles.messageBubble, 
            isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
            message.isLoading && styles.messageBubbleLoading,
          ]}
          onPress={isAssistant && isLatestAssistant ? onEditTap : undefined}
          onLongPress={message.content ? onCopy : undefined}
        >
          {message.isLoading ? (
            <View style={styles.scriptLoadingContainer}>
              <TypingIndicator />
            </View>
          ) : (
            <>
              <Text style={[styles.messageText, isUser && styles.messageTextUser]}>
                {message.content.replace(/\?\?\?/g, '?')}
              </Text>
              {message.isEdited && (
                <Text style={styles.editedLabel}>Edited</Text>
              )}
            </>
          )}
        </Pressable>
      )}
      
      {/* Action buttons for user messages */}
      {isUser && !message.isLoading && message.content && (
        <View style={[styles.messageActions, styles.messageActionsUser]}>
          {isCopied ? (
            <View style={styles.copiedFeedback}>
              <Check size={14} color={Colors.ember} strokeWidth={2.5} />
              <Text style={styles.copiedText}>Copied</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={onCopy} style={styles.actionButton}>
              <Copy size={14} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}
      
      {/* Action buttons for assistant messages */}
      {isAssistant && !message.isLoading && (
        <View style={styles.messageActions}>
          {/* Copy button */}
          {isCopied ? (
            <View style={styles.copiedFeedback}>
              <Check size={14} color={Colors.ember} strokeWidth={2.5} />
              <Text style={styles.copiedText}>Copied</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={onCopy} style={styles.actionButton}>
              <Copy size={14} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          
          {/* Voice preview button */}
          <TouchableOpacity 
            onPress={onPlayVoice} 
            style={styles.actionButton}
            disabled={isGeneratingVoice}
          >
            {isGeneratingVoice ? (
              <ActivityIndicator size={14} color={Colors.ember} />
            ) : isPlayingVoice ? (
              <VolumeX size={14} color={Colors.ember} />
            ) : (
              <Volume2 size={14} color={Colors.textSecondary} />
            )}
          </TouchableOpacity>
          
          {/* Script hint for latest assistant message */}
          {isLatestAssistant && (
            <Text style={styles.scriptHint}>this message will be used as script</Text>
          )}
        </View>
      )}
    </View>
  );
}

// Full-screen script editor modal
function ScriptEditor({
  visible,
  script,
  onSave,
  onClose,
}: {
  visible: boolean;
  script: string;
  onSave: (newScript: string) => void;
  onClose: () => void;
}) {
  const [editedScript, setEditedScript] = useState(script);
  const insets = useSafeAreaInsets();
  
  useEffect(() => {
    setEditedScript(script);
  }, [script, visible]);
  
  if (!visible) return null;
  
  return (
    <View style={[styles.editorOverlay, { paddingTop: insets.top }]}>
      <View style={styles.editorHeader}>
        <TouchableOpacity onPress={onClose} style={styles.editorCloseButton}>
          <X size={24} color={Colors.ink} />
        </TouchableOpacity>
        <Text style={styles.editorTitle}>Edit Script</Text>
        <TouchableOpacity onPress={() => onSave(editedScript)} style={styles.editorSaveButton}>
          <Check size={24} color={Colors.ember} />
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.editorInput}
        value={editedScript.replace(/\?\?\?/g, '?')}
        onChangeText={setEditedScript}
        multiline
        textAlignVertical="top"
        autoFocus
        placeholderTextColor={Colors.gray400}
      />
    </View>
  );
}

export default function ChatComposerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; fromVideo?: string }>();
  const projectId = params.projectId as any;
  const fromVideo = params.fromVideo === 'true';
  const insets = useSafeAreaInsets();
  const { user, userId, addVideo } = useApp();
  
  // Fetch backend user for voice configuration check
  const backendUser = useQuery(
    api.users.getCurrentUser,
    userId ? { userId } : "skip"
  );
  
  // State
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [mediaUris, setMediaUris] = useState<PendingMedia[]>([]);
  const [sentMediaIds, setSentMediaIds] = useState<Set<string>>(new Set()); // Track media already sent in messages
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasScript, setHasScript] = useState(false);
  const [userMessageCount, setUserMessageCount] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [editingScript, setEditingScript] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(projectId || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // Track if we've forked from a completed video project
  const [hasForkedFromVideo, setHasForkedFromVideo] = useState(false);
  const [originalVideoProjectId] = useState<string | null>(fromVideo ? projectId : null);
  const [isForking, setIsForking] = useState(false);
  
  // Voice preview state
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [generatingVoiceMessageId, setGeneratingVoiceMessageId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map()); // messageId -> audioUrl
  
  // Project settings state
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.08); // Default: Normal
  const [keepOrder, setKeepOrder] = useState<boolean>(false);
  
  // Voice configuration modal state (progressive disclosure)
  const [showVoiceConfigModal, setShowVoiceConfigModal] = useState(false);
  const [pendingVoiceAction, setPendingVoiceAction] = useState<{
    type: 'play' | 'submit';
    messageId?: string;
    content?: string;
  } | null>(null);
  const hasShownVoicePromptRef = useRef(false);
  const skipVoiceCheckRef = useRef(false); // Temporary flag to skip voice check after config
  
  // Chat onboarding tips state
  const [showChatOnboarding, setShowChatOnboarding] = useState(false);
  const [spotlightRects, setSpotlightRects] = useState<(SpotlightRect | null)[]>([null, null, null, null]);
  const scriptBubbleRef = useRef<View>(null);
  const threeDotsRef = useRef<View>(null);
  const composerRef = useRef<View>(null);
  const generateButtonRef = useRef<View>(null);
  
  const hasAutoOpenedPicker = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const isMountedRef = useRef(true);
  const scriptBackfillRef = useRef<Set<string>>(new Set());
  
  // Convex hooks
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl);
  const createChatProject = useMutation(api.tasks.createChatProject);
  const addFilesToProject = useMutation(api.tasks.addFilesToProject);
  const addChatMessage = useMutation(api.tasks.addChatMessage);
  const updateChatMessage = useMutation(api.tasks.updateChatMessage);
  const updateChatProjectPrompt = useMutation(api.tasks.updateChatProjectPrompt);
  const forkChatProject = useMutation(api.tasks.forkChatProject);
  const generateChatScript = useAction(api.aiServices.generateChatScript);
  const markProjectSubmitted = useMutation(api.tasks.markProjectSubmitted);
  const updateProjectScript = useMutation(api.tasks.updateProjectScript);
  const generateScriptPreviewAudio = useAction(api.aiServices.generateScriptPreviewAudio);
  const updateProjectVoiceSpeed = useMutation(api.tasks.updateProjectVoiceSpeed);
  const updateProjectKeepOrder = useMutation(api.tasks.updateProjectKeepOrder);
  const refreshProjectR2Urls = useAction(api.tasks.refreshProjectR2Urls);
  const regenerateProjectEditing = useMutation(api.tasks.regenerateProjectEditing);
  const completeChatTips = useMutation(api.users.completeChatTips);
  
  // Track if we've already tried to refresh R2 URLs for this project
  const hasAttemptedR2Refresh = useRef(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Fetch current project data (tracks newly created/forked chat projects too)
  const existingProject = useQuery(
    api.tasks.getProject,
    createdProjectId ? { id: createdProjectId as any } : "skip"
  );
  
  // Fetch existing chat messages
  const existingMessages = useQuery(
    api.tasks.getChatMessages,
    createdProjectId ? { projectId: createdProjectId as any } : "skip"
  );
  
  // Helper: Fork the project if coming from a completed video (never modify original)
  const forkProjectIfNeeded = async (): Promise<string | null> => {
    // Only fork if we came from a video and haven't forked yet
    if (!fromVideo || hasForkedFromVideo || !originalVideoProjectId) {
      return createdProjectId;
    }
    
    setIsForking(true);
    try {
      console.log('[chat-composer] Forking project from completed video:', originalVideoProjectId);
      const newProjectId = await forkChatProject({
        sourceProjectId: originalVideoProjectId as any,
      });
      
      console.log('[chat-composer] Forked to new project:', newProjectId);
      setCreatedProjectId(newProjectId);
      setHasForkedFromVideo(true);
      return newProjectId;
    } catch (error) {
      console.error('[chat-composer] Failed to fork project:', error);
      Alert.alert('Error', 'Failed to create a new draft from this video. Please try again.');
      return null;
    } finally {
      setIsForking(false);
    }
  };

  // Load existing project data
  useEffect(() => {
    if (existingProject && projectId && messages.length === 0) {
      // Load media from project
      if (existingProject.fileUrls && existingProject.fileMetadata) {
        const mediaFromProject = existingProject.fileUrls
          .map((url: string | null, index: number) => {
            if (!url) return null;
            const metadata = existingProject.fileMetadata?.[index];
            const isVideo = metadata?.contentType?.startsWith('video/') ?? false;
            return {
              uri: url,
              type: (isVideo ? 'video' : 'image') as 'video' | 'image',
              id: `existing-${index}`,
              storageId: metadata?.storageId,
              uploadStatus: 'uploaded' as const,
              thumbnailLoaded: true,
            };
          })
          .filter((item: any): item is typeof mediaUris[0] => item !== null);
        
        setMediaUris(mediaFromProject);
      }
      
      // If coming from video preview, load chat history
      if (existingProject.chatEnabled && existingMessages) {
        // Create a lookup map from storageId to file metadata for media type detection
        const metadataByStorageId = new Map<string, { contentType: string }>();
        existingProject.fileMetadata?.forEach((meta: any) => {
          if (meta?.storageId) {
            metadataByStorageId.set(meta.storageId, meta);
          }
        });
        
        const loadedMessages: LocalChatMessage[] = existingMessages.map((msg: any) => ({
          id: msg._id,
          role: msg.role,
          content: msg.content,
          isEdited: msg.isEdited,
          createdAt: msg.createdAt,
          // Map mediaUrls back to mediaUris format for UI display
          mediaUris: msg.mediaUrls && msg.mediaIds 
            ? msg.mediaUrls
                .map((url: string | null, index: number) => {
                  if (!url) return null;
                  const storageId = msg.mediaIds[index];
                  // Look up media type from project metadata
                  const metadata = storageId ? metadataByStorageId.get(storageId) : null;
                  const isVideo = metadata?.contentType?.startsWith('video/') ?? false;
                  return {
                    uri: url,
                    type: (isVideo ? 'video' : 'image') as 'video' | 'image',
                    storageId: storageId,
                  };
                })
                .filter((item: any): item is { uri: string; type: 'video' | 'image'; storageId: string } => item !== null)
            : undefined,
        }));
        const hasAssistantMessage = loadedMessages.some(m => m.role === 'assistant');
        const hasProjectScript = !!existingProject.script?.trim();
        let hydratedMessages = loadedMessages;

        // Background generation can complete after this screen unmounts, which may leave
        // project.script populated but chatMessages missing the assistant response.
        // Backfill the UI and persist once so notification-opened chats remain consistent.
        if (!hasAssistantMessage && hasProjectScript) {
          hydratedMessages = [
            ...loadedMessages,
            {
              id: `script-backfill-${existingProject._id}`,
              role: 'assistant',
              content: existingProject.script!,
              createdAt: existingProject.scriptGeneratedAt || existingProject.createdAt || Date.now(),
            },
          ];

          const projectKey = String(existingProject._id);
          if (!scriptBackfillRef.current.has(projectKey)) {
            scriptBackfillRef.current.add(projectKey);
            addChatMessage({
              projectId: existingProject._id,
              role: 'assistant',
              content: existingProject.script!,
            }).catch((error) => {
              console.error('[chat-composer] Failed to backfill assistant script message:', error);
            });
          }
        }

        setMessages(hydratedMessages);
        setUserMessageCount(existingProject.userMessageCount || 0);
        
        // Consider script present if either assistant chat exists or project.script is set.
        setHasScript(hasAssistantMessage || hasProjectScript);
        
        // Mark all existing media as "sent" so they don't appear in the composer
        // (they were already sent in previous chat messages)
        const existingMediaIds = new Set<string>();
        for (let i = 0; i < (existingProject.fileUrls?.length || 0); i++) {
          existingMediaIds.add(`existing-${i}`);
        }
        setSentMediaIds(existingMediaIds);
      }
    }
  }, [existingProject, existingMessages, projectId]);
  
  // Refresh R2 URLs for old projects where Convex storage has been deleted
  // This regenerates presigned URLs from R2 keys stored in fileMetadata
  useEffect(() => {
    if (!existingProject || !projectId || hasAttemptedR2Refresh.current) return;
    
    // Check if we have fileMetadata with R2 keys but some/all fileUrls are null
    const hasR2Keys = existingProject.fileMetadata?.some((meta: any) => meta.r2Key);
    const hasMissingUrls = existingProject.fileUrls?.some((url: string | null) => !url);
    
    if (hasR2Keys && hasMissingUrls && existingProject.fileMetadata && existingProject.fileMetadata.length > 0) {
      console.log('[chat-composer] Detected missing file URLs with R2 keys available, refreshing R2 URLs...');
      hasAttemptedR2Refresh.current = true;
      
      refreshProjectR2Urls({ projectId })
        .then((result) => {
          console.log('[chat-composer] R2 URL refresh result:', result);
        })
        .catch((error) => {
          console.error('[chat-composer] Failed to refresh R2 URLs:', error);
        });
    }
  }, [existingProject, projectId, refreshProjectR2Urls]);
  
  // Refresh media URLs when queries return fresh data (URLs expire after 1 hour)
  // This runs even after initial load to ensure URLs stay fresh
  useEffect(() => {
    if (!existingProject || !projectId) return;
    
    // Update project media URLs if they've changed (fresh from query)
    if (existingProject.fileUrls && existingProject.fileMetadata && mediaUris.length > 0) {
      const freshMediaUris = mediaUris.map((media, index) => {
        // Only update existing media items that came from the project
        if (media.id.startsWith('existing-')) {
          const existingIndex = parseInt(media.id.replace('existing-', ''));
          const freshUrl = existingProject.fileUrls?.[existingIndex];
          if (freshUrl && freshUrl !== media.uri) {
            console.log(`[chat-composer] Refreshing expired URL for media ${existingIndex}`);
            return { ...media, uri: freshUrl };
          }
        }
        return media;
      });
      
      // Only update state if URLs actually changed
      const urlsChanged = freshMediaUris.some((m, i) => m.uri !== mediaUris[i].uri);
      if (urlsChanged) {
        setMediaUris(freshMediaUris);
      }
    }
  }, [existingProject?.fileUrls, projectId]);
  
  // Refresh message media URLs when existingMessages query returns fresh data
  useEffect(() => {
    if (!existingMessages || messages.length === 0) return;
    
    // Create a map of fresh URLs from the query
    const freshUrlsMap = new Map<string, (string | null)[]>();
    existingMessages.forEach((msg: any) => {
      if (msg.mediaUrls) {
        freshUrlsMap.set(msg._id, msg.mediaUrls);
      }
    });
    
    // Update messages with fresh URLs
    let hasChanges = false;
    const updatedMessages = messages.map(msg => {
      const freshUrls = freshUrlsMap.get(msg.id);
      if (freshUrls && msg.mediaUris) {
        const updatedMediaUris = msg.mediaUris.map((media, index) => {
          const freshUrl = freshUrls[index];
          if (freshUrl && freshUrl !== media.uri) {
            hasChanges = true;
            console.log(`[chat-composer] Refreshing expired URL for message ${msg.id} media ${index}`);
            return { ...media, uri: freshUrl };
          }
          return media;
        });
        return { ...msg, mediaUris: updatedMediaUris };
      }
      return msg;
    });
    
    if (hasChanges) {
      setMessages(updatedMessages);
    }
  }, [existingMessages]);
  
  // Auto-focus keyboard for new projects (after screen transition completes)
  useFocusEffect(
    useCallback(() => {
      if (!projectId && !hasAutoOpenedPicker.current && messages.length === 0) {
        hasAutoOpenedPicker.current = true;
        // Wait for screen transition animation to fully complete
        const task = InteractionManager.runAfterInteractions(() => {
          // Additional delay to ensure screen is fully rendered
          setTimeout(() => {
            inputRef.current?.focus();
          }, 500);
        });
        return () => task.cancel();
      }
    }, [projectId, messages.length])
  );
  
  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);
  
  // Scroll to bottom when keyboard appears and track keyboard visibility
  useEffect(() => {
    const scrollToBottom = () => {
      // Scroll immediately
      scrollViewRef.current?.scrollToEnd({ animated: true });
      // And again after keyboard animation completes
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 350);
    };
    
    const handleKeyboardShow = () => {
      setKeyboardVisible(true);
      scrollToBottom();
    };
    
    const handleKeyboardHide = () => {
      setKeyboardVisible(false);
    };
    
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      handleKeyboardShow
    );
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      handleKeyboardShow
    );
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      handleKeyboardHide
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      handleKeyboardHide
    );
    
    return () => {
      keyboardWillShowListener.remove();
      keyboardDidShowListener.remove();
      keyboardWillHideListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);
  
  // Dismiss keyboard when loading overlay is shown
  useEffect(() => {
    if (isProcessingMedia) {
      Keyboard.dismiss();
    }
  }, [isProcessingMedia]);
  
  const pickMedia = async () => {
    // Dismiss keyboard immediately when opening media picker
    Keyboard.dismiss();
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant permission to access your photos.');
      return;
    }
    
    // Add a 2 second delay before showing the loading indicator
    // This prevents the overlay from flashing for quick operations
    const loadingTimeout = setTimeout(() => {
      setIsProcessingMedia(true);
    }, 2000);
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos', 'images'],
        allowsMultipleSelection: true,
        quality: 1,
        videoExportPreset: VideoExportPreset.H264_1920x1080,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        // Show as half-screen sheet on iOS so "Hello, [user]!" header is visible
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FORM_SHEET,
      });
      
      if (!result.canceled && result.assets.length > 0) {
        const baseTimestamp = generateMediaTimestamp();
        // Create media items with thumbnailLoaded: false to show placeholder
        // Videos are marked as loaded immediately since VideoView doesn't have onLoad
        const newMedia: PendingMedia[] = result.assets.map((asset, index) => ({
          uri: asset.uri,
          type: (asset.type === 'video' ? 'video' : 'image') as 'video' | 'image',
          id: `${baseTimestamp + index}`,
          assetId: asset.assetId ?? undefined,
          uploadStatus: 'pending' as const,
          thumbnailLoaded: asset.type === 'video', // Videos show immediately
        }));
        
        // Add media immediately to show placeholders in UI
        const allMedia = [...mediaUris, ...newMedia];
        setMediaUris(allMedia);
        
        // Start uploading in background (no overlay)
        uploadMediaInBackground(allMedia, newMedia);
      }
    } catch (error) {
      console.error('Error picking media:', error);
    } finally {
      // Cancel the loading timeout if operation finished before 2 seconds
      clearTimeout(loadingTimeout);
      // Clear processing state after ImagePicker returns
      setIsProcessingMedia(false);
    }
  };
  
  const uploadMediaInBackground = async (allMedia: PendingMedia[], newMediaOnly: PendingMedia[]) => {
    const filesToUpload = newMediaOnly.filter(m => !m.storageId);
    
    if (filesToUpload.length === 0) {
      inputRef.current?.focus();
      return;
    }
    
    // Mark all as uploading
    setMediaUris(prev => prev.map(m => 
      filesToUpload.some(f => f.id === m.id) 
        ? { ...m, uploadStatus: 'uploading' as const }
        : m
    ));
    
    // Track successfully uploaded items with their storage IDs
    const successfullyUploadedItems: PendingMedia[] = [];
    
    for (const item of filesToUpload) {
      try {
        const uploadResult = await uploadMediaFiles(
          generateUploadUrl,
          [{ uri: item.uri, type: item.type, assetId: item.assetId }]
        );
        
        const storageId = uploadResult[0]?.storageId;
        
        // Update individual item status in state
        setMediaUris(prev => prev.map(m => 
          m.id === item.id 
            ? { ...m, uploadStatus: 'uploaded' as const, storageId }
            : m
        ));
        
        // Track this item for later use (with storageId)
        if (storageId) {
          successfullyUploadedItems.push({
            ...item,
            uploadStatus: 'uploaded',
            storageId,
          });
        }
      } catch (error) {
        console.error('Failed to upload file', item.id, error);
        // Mark as failed but don't block other uploads
        setMediaUris(prev => prev.map(m => 
          m.id === item.id 
            ? { ...m, uploadStatus: 'failed' as const }
            : m
        ));
      }
    }
    
    // Focus input after all uploads - user can add a prompt and press Send
    setTimeout(() => inputRef.current?.focus(), 100);
  };
  
  const removeMedia = (id: string) => {
    setMediaUris(prev => prev.filter(m => m.id !== id));
  };
  
  const markThumbnailLoaded = (id: string) => {
    setMediaUris(prev => prev.map(m => 
      m.id === id ? { ...m, thumbnailLoaded: true } : m
    ));
  };
  
  const handleSend = async () => {
    const selectedMedia = mediaUris.filter(m => !sentMediaIds.has(m.id));
    const mediaNotReady = selectedMedia.some(
      (media) => media.uploadStatus !== 'uploaded' || !media.thumbnailLoaded
    );
    if (mediaNotReady) {
      return;
    }

    // Get pending media (uploaded but not yet sent in a message)
    const pendingMedia = mediaUris.filter(m => m.storageId && !sentMediaIds.has(m.id));
    const hasPendingMedia = pendingMedia.length > 0;
    
    // Check message limit
    if (userMessageCount >= MAX_USER_MESSAGES) {
      Alert.alert(
        'Message Limit Reached',
        'You can edit the script directly by tapping on it, or approve and generate your video.'
      );
      return;
    }
    
    // Need either media or text for first message
    if (!hasScript && pendingMedia.length === 0) {
      Alert.alert('No Media', 'Please add some photos or videos first.');
      return;
    }
    
    // For follow-up messages, need either text or new media
    if (hasScript && !inputText.trim() && !hasPendingMedia) {
      // Nothing to send - this shouldn't happen with proper UI state
      return;
    }
    
    Keyboard.dismiss();
    
    // Create user message with any pending media
    const userMessage: LocalChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      mediaUris: hasPendingMedia ? pendingMedia.map(m => ({
        uri: m.uri,
        type: m.type,
        storageId: m.storageId,
      })) : undefined,
      createdAt: Date.now(),
    };
    
    // Mark pending media as sent
    if (hasPendingMedia) {
      setSentMediaIds(prev => {
        const newSet = new Set(prev);
        pendingMedia.forEach(m => newSet.add(m.id));
        return newSet;
      });
    }
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setUserMessageCount(prev => prev + 1);
    
    // Get new media IDs for generateScript
    const newMediaIds = hasPendingMedia 
      ? pendingMedia.map(m => m.storageId).filter((id): id is string => !!id)
      : [];
    
    await generateScript(inputText.trim(), hasPendingMedia, pendingMedia.length, newMediaIds);
  };
  
  const generateScript = async (userInput: string, isNewMedia = false, newMediaCount = 0, newMediaIds: string[] = []) => {
    if (!isMountedRef.current) return;
    setIsGenerating(true);
    let requestProjectId: string | null = createdProjectId;
    
    // Add loading message
    const loadingMessage: LocalChatMessage = {
      id: `loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      isLoading: true,
      createdAt: Date.now(),
    };
    setMessages(prev => [...prev, loadingMessage]);
    
    try {
      // If coming from a video, fork the project first (never modify original)
      let currentProjectId = requestProjectId;
      if (fromVideo && !hasForkedFromVideo) {
        currentProjectId = await forkProjectIfNeeded();
        requestProjectId = currentProjectId;
        if (!currentProjectId) {
          if (isMountedRef.current) {
            setMessages(prev => prev.filter(m => !m.isLoading));
            setIsGenerating(false);
          }
          return;
        }
      }
      
      if (!currentProjectId) {
        const uploadedMedia = mediaUris.filter(m => m.storageId);
        const fileMetadata = uploadedMedia.map(m => ({
          storageId: m.storageId,
          filename: `${m.type}_${m.id}.${m.type === 'video' ? 'mp4' : 'jpg'}`,
          contentType: m.type === 'video' ? 'video/mp4' : 'image/jpeg',
          size: 0,
        }));
        
        currentProjectId = await createChatProject({
          userId,
          files: uploadedMedia.map(m => m.storageId),
          fileMetadata,
          thumbnail: uploadedMedia[0]?.storageId,
        });
        requestProjectId = currentProjectId;
        
        if (isMountedRef.current) {
          setCreatedProjectId(currentProjectId);
        }
        
        // Update prompt
        if (userInput) {
          await updateChatProjectPrompt({
            projectId: currentProjectId,
            prompt: userInput,
          });
        }
      }
      
      // Store user message in backend
      // Get uploaded media for attaching to the first user message
      const uploadedMediaForMessage = mediaUris.filter(m => m.storageId);
      
      // Determine which media IDs to attach:
      // - For first message: all uploaded media
      // - For follow-up messages with new media: the new media IDs passed in
      let mediaIdsToAttach: string[] | undefined;
      if (!hasScript && uploadedMediaForMessage.length > 0) {
        // First message - attach all media
        mediaIdsToAttach = uploadedMediaForMessage.map(m => m.storageId).filter(Boolean) as string[];
      } else if (isNewMedia && newMediaIds.length > 0) {
        // Follow-up message with new media - attach the new media IDs
        mediaIdsToAttach = newMediaIds;
      }
      
      await addChatMessage({
        projectId: currentProjectId,
        role: 'user',
        content: userInput || '',
        messageIndex: userMessageCount + 1,
        mediaIds: mediaIdsToAttach as any,
      });

      // Keep project-level media in sync for follow-up messages with new uploads.
      // Composition/rendering reads project.files + project.fileMetadata.
      const isFollowUpWithNewMedia = hasScript && isNewMedia && newMediaIds.length > 0;
      let newMediaFilesForCaptioning:
        | { url: string; filename: string; contentType: string }[]
        | undefined;
      if (isFollowUpWithNewMedia) {
        const newMediaIdSet = new Set(newMediaIds);
        const uniqueNewMedia = Array.from(
          new Map(
            mediaUris
              .filter(m => m.storageId && newMediaIdSet.has(m.storageId))
              .map(m => [String(m.storageId), m])
          ).values()
        );

        if (uniqueNewMedia.length > 0) {
          const filesToAdd = uniqueNewMedia
            .map(m => m.storageId)
            .filter((id): id is string => !!id);

          const fileMetadataToAdd = uniqueNewMedia
            .filter((m): m is PendingMedia & { storageId: string } => !!m.storageId)
            .map((m) => ({
              storageId: m.storageId as any,
              filename: `${m.type}_${m.id}.${m.type === 'video' ? 'mp4' : 'jpg'}`,
              contentType: m.type === 'video' ? 'video/mp4' : 'image/jpeg',
              size: 0,
            }));

          if (filesToAdd.length > 0 && fileMetadataToAdd.length > 0) {
            await addFilesToProject({
              projectId: currentProjectId,
              files: filesToAdd as any,
              fileMetadata: fileMetadataToAdd as any,
            });
          }

          const newMediaFilesRaw = await Promise.all(
            uniqueNewMedia.map(async (media) => {
              if (!media.storageId) return null;
              const url = await convex.query(api.tasks.getStorageUrl, {
                storageId: media.storageId as any,
              });
              if (!url) return null;
              return {
                url,
                filename: `${media.type}_${media.id}.${media.type === 'video' ? 'mp4' : 'jpg'}`,
                contentType: media.type === 'video' ? 'video/mp4' : 'image/jpeg',
              };
            })
          );
          newMediaFilesForCaptioning = newMediaFilesRaw.filter(
            (item): item is { url: string; filename: string; contentType: string } => item !== null
          );
        }
      }
      
      // Build conversation history for AI
      const conversationHistory = messages
        .filter(m => !m.isLoading)
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
      
      // Add the current message
      conversationHistory.push({
        role: 'user',
        content: userInput || 'Generate a script based on my media',
      });
      
      // Get storage IDs for media - backend will fetch proper URLs from Convex storage
      const uploadedMedia = mediaUris.filter(m => m.storageId);
      const storageIds = uploadedMedia
        .map(m => m.storageId)
        .filter((id): id is string => !!id);
      
      // Use pre-computed media descriptions if available (from Gemini captioning)
      // This makes script generation much faster and cheaper
      const cachedDescriptions = existingProject?.mediaDescriptions;
      
      // Generate script (saveAndNotify: true means backend saves script and sends notification)
      const result = await generateChatScript({
        projectId: currentProjectId,
        conversationHistory,
        storageIds,
        cachedMediaDescriptions: cachedDescriptions,
        newMediaFiles: newMediaFilesForCaptioning,
        isFirstMessage: !hasScript,
        isNewMedia,
        newMediaCount,
        saveAndNotify: true,
      });
      
      // Remove loading message and add real response
      if (isMountedRef.current) {
        setMessages(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        
        if (result.success && result.script) {
          const assistantMessage: LocalChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: result.script,
            createdAt: Date.now(),
          };
          
          return [...withoutLoading, assistantMessage];
        } else {
          // Add error message
          const errorMessage: LocalChatMessage = {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, I couldn\'t generate a script. Please try again.',
            createdAt: Date.now(),
          };
          return [...withoutLoading, errorMessage];
        }
        });
      }
      
      // Backend generateChatScript(saveAndNotify=true) already saves script + assistant
      // message. Keep local UI in sync but avoid duplicate persistence here.
      if (result.success && result.script) {
        if (isMountedRef.current) {
          setHasScript(true);
          triggerChatOnboarding();
        }
      }
    } catch (error: any) {
      // Check if this is a known transient case where backend may still succeed.
      const isConnectionLost = error?.message?.includes('Connection lost');
      if (!isConnectionLost) {
        console.error('Error generating script:', error);
      } else {
        console.log('[chat-composer] Connection lost while request in flight; attempting recovery');
      }
      
      if (isConnectionLost && requestProjectId) {
        console.log('[chat-composer] Connection lost - checking if script was generated...');
        
        // Wait a moment for any in-flight updates to settle
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        try {
          // Fetch the project to check if script exists
          const project = await convex.query(api.tasks.getProject, { id: requestProjectId as any });
          
          if (project?.script) {
            console.log('[chat-composer] Script was actually generated! Recovering...');
            
            // Remove loading message and add the script as assistant message
            if (isMountedRef.current) {
              setMessages(prev => {
                const withoutLoading = prev.filter(m => !m.isLoading);
                const assistantMessage: LocalChatMessage = {
                  id: `assistant-${Date.now()}`,
                  role: 'assistant',
                  content: project.script!,
                  createdAt: Date.now(),
                };
                return [...withoutLoading, assistantMessage];
              });
            }
            
            if (isMountedRef.current) {
              setHasScript(true);
              setIsGenerating(false);
              triggerChatOnboarding();
            }
            return; // Successfully recovered
          }
        } catch (recoveryError) {
          console.error('[chat-composer] Recovery check failed:', recoveryError);
        }
      }
      
      // If we couldn't recover, show error
      if (isMountedRef.current) {
        setMessages(prev => prev.filter(m => !m.isLoading));
        Alert.alert('Error', 'Failed to generate script. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  };
  
  const handleEditScript = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingScript(content);
    setShowEditor(true);
  };
  
  const handleSaveEdit = async (newScript: string) => {
    if (!editingMessageId) return;
    
    // If coming from a video, fork the project first (never modify original)
    let targetProjectId = createdProjectId;
    if (fromVideo && !hasForkedFromVideo) {
      targetProjectId = await forkProjectIfNeeded();
      if (!targetProjectId) {
        setShowEditor(false);
        setEditingMessageId(null);
        return;
      }
    }
    
    if (!targetProjectId) return;
    
    // Update local message - only mark as edited if content actually changed
    const wasActuallyEdited = newScript !== editingScript;
    setMessages(prev => prev.map(m => 
      m.id === editingMessageId 
        ? { ...m, content: newScript, isEdited: m.isEdited || wasActuallyEdited }
        : m
    ));
    
    // For forked projects or local messages, update project script directly
    // (Message IDs from original project won't exist in the forked project)
    if (hasForkedFromVideo || editingMessageId.startsWith('assistant-') || editingMessageId.startsWith('user-')) {
      try {
        await updateProjectScript({
          id: targetProjectId as any,
          script: newScript.replace(/\?(?!\?\?)/g, '???'),
        });
      } catch (error) {
        console.error('Failed to update script:', error);
      }
    } else {
      // Update in backend if it's a real message ID (not local) and not forked
      try {
        await updateChatMessage({
          messageId: editingMessageId as any,
          content: newScript.replace(/\?(?!\?\?)/g, '???'),
        });
      } catch (error) {
        console.error('Failed to update message:', error);
      }
    }
    
    setShowEditor(false);
    setEditingMessageId(null);
  };
  
  const handleCopy = async (messageId: string, content: string) => {
    try {
      await Clipboard.setStringAsync(content.replace(/\?\?\?/g, '?'));
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Copy error:', error);
    }
  };
  
  // Check if user needs voice configuration (progressive disclosure)
  // Use selectedVoiceId which covers both custom voice clones AND default voice selections
  const needsVoiceConfig = !backendUser?.selectedVoiceId && !backendUser?.elevenlabsVoiceId;
  
  // Helper to check if voice prompt should be shown (computed at call time)
  const shouldShowVoicePrompt = () => {
    if (skipVoiceCheckRef.current) return false;
    if (!needsVoiceConfig) return false;
    return ENABLE_TEST_RUN_MODE || !hasShownVoicePromptRef.current;
  };
  
  // Voice preview handlers
  const handlePlayVoice = async (messageId: string, content: string) => {
    // Check if voice configuration is needed before playing
    if (shouldShowVoicePrompt()) {
      setPendingVoiceAction({ type: 'play', messageId, content });
      setShowVoiceConfigModal(true);
      return;
    }
    
    // If already playing this message, stop it
    if (playingMessageId === messageId) {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setPlayingMessageId(null);
      return;
    }
    
    // Stop any currently playing audio
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingMessageId(null);
    
    // Set audio mode to play through speaker (important for iOS silent mode)
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
    } catch (error) {
      console.log('Failed to set audio mode:', error);
    }
    
    // Check if we have cached audio for this message
    const cachedUrl = audioCache.current.get(messageId);
    
    if (cachedUrl) {
      // Use cached audio - instant playback!
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: cachedUrl },
          { shouldPlay: true }
          // Speed is NOT applied here - preview plays at natural speed
          // Speed setting is for final video only (FFmpeg handles it better)
        );
        soundRef.current = sound;
        setPlayingMessageId(messageId);
        
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingMessageId(null);
            sound.unloadAsync();
            soundRef.current = null;
          }
        });
        return;
      } catch (error) {
        console.log('Cached audio failed, regenerating:', error);
        audioCache.current.delete(messageId); // Clear invalid cache
      }
    }
    
    // Generate new audio (ElevenLabs always generates at 1.2x speed)
    setGeneratingVoiceMessageId(messageId);
    
    try {
      const result = await generateScriptPreviewAudio({
        messageId: messageId, // Can be local ID or Convex ID
        script: content,
        userId: userId || undefined, // Pass userId to use their selected voice
      });
      
      if (result.success && result.audioUrl) {
        // Cache the audio URL for future plays
        audioCache.current.set(messageId, result.audioUrl);
        
        // Play the audio at natural speed
        // Speed setting is for final video only (FFmpeg handles it better)
        const { sound } = await Audio.Sound.createAsync(
          { uri: result.audioUrl },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        setPlayingMessageId(messageId);
        
        // Handle playback finished
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingMessageId(null);
            sound.unloadAsync();
            soundRef.current = null;
          }
        });
      } else {
        Alert.alert('Error', result.error || 'Failed to generate voice preview');
      }
    } catch (error) {
      console.error('Voice preview error:', error);
      Alert.alert('Error', 'Failed to generate voice preview');
    } finally {
      setGeneratingVoiceMessageId(null);
    }
  };
  
  // Speed change handler - sets speed for final video (FFmpeg)
  // Preview always plays at natural speed for best quality
  const handleChangeSpeed = () => {
    const applySpeed = async (newSpeed: number) => {
      setVoiceSpeed(newSpeed);
      
      // Save to backend for FFmpeg to use in final video
      if (createdProjectId) {
        try {
          await updateProjectVoiceSpeed({
            id: createdProjectId as any,
            voiceSpeed: newSpeed,
          });
        } catch (error) {
          console.error('Failed to save voice speed:', error);
        }
      }
    };
    
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...VOICE_SPEED_OPTIONS.map(o => o.label), 'Cancel'],
          cancelButtonIndex: VOICE_SPEED_OPTIONS.length,
          title: 'Voiceover Speed (Final Video)',
          message: 'Preview plays at normal speed',
        },
        async (buttonIndex) => {
          if (buttonIndex < VOICE_SPEED_OPTIONS.length) {
            await applySpeed(VOICE_SPEED_OPTIONS[buttonIndex].value);
          }
        }
      );
    } else {
      // Android: Use simple Alert with options
      Alert.alert(
        'Voiceover Speed',
        'Select speed for the final video (preview plays at normal speed)',
        VOICE_SPEED_OPTIONS.map(option => ({
          text: option.label,
          onPress: () => applySpeed(option.value),
        }))
      );
    }
  };
  
  // Keep order toggle handler
  const handleToggleKeepOrder = async () => {
    const newValue = !keepOrder;
    setKeepOrder(newValue);
    
    // Save to backend if we have a project
    if (createdProjectId) {
      try {
        await updateProjectKeepOrder({
          id: createdProjectId as any,
          keepOrder: newValue,
        });
      } catch (error) {
        console.error('Failed to save keep order:', error);
      }
    }
  };
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);
  
  // Handle regenerate when coming from video without modifications
  const handleRegenerateFromVideo = async () => {
    if (!originalVideoProjectId || isRegenerating) return;

    setIsRegenerating(true);
    try {
      console.log('[chat-composer] Regenerating project editing for:', originalVideoProjectId);
      
      const result = await regenerateProjectEditing({
        sourceProjectId: originalVideoProjectId as any,
      });

      if (result.success && result.newProjectId) {
        console.log('[chat-composer] New project created:', result.newProjectId);
        
        // Get the latest script from messages
        const latestScript = messages
          .filter(m => m.role === 'assistant' && !m.isLoading)
          .sort((a, b) => b.createdAt - a.createdAt)[0]?.content;
        
        addVideo({
          id: result.newProjectId,
          uri: '',
          prompt: existingProject?.prompt || 'Regenerated video',
          script: latestScript?.replace(/\?\?\?/g, '?'),
          createdAt: Date.now(),
          status: 'processing',
          projectId: result.newProjectId,
          thumbnailUrl: existingProject?.thumbnailUrl || mediaUris[0]?.uri,
        });

        Alert.alert(
          '🎬 Generation Started!',
          'Your video is being created! Feel free to close the app — we\'ll send you a notification when it\'s ready.',
          [{
            text: 'Got it!',
            style: 'default',
            onPress: () => {
              router.replace('/(tabs)');
            }
          }]
        );
      } else {
        throw new Error('Failed to create regenerated project');
      }
    } catch (error) {
      console.error('[chat-composer] Regenerate error:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('FREE_TIER_LIMIT_REACHED') || errorMessage.includes('NO_CREDITS_AVAILABLE')) {
        router.push('/paywall');
      } else {
        Alert.alert('Error', 'Failed to regenerate video. Please try again.');
      }
    } finally {
      setIsRegenerating(false);
    }
  };
  
  const handleApproveAndGenerate = async () => {
    if (isSubmitting) return;
    
    // Check if voice configuration is needed before submitting
    if (shouldShowVoicePrompt()) {
      setPendingVoiceAction({ type: 'submit' });
      setShowVoiceConfigModal(true);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // If coming from a video, fork the project first (never modify original)
      let targetProjectId = createdProjectId;
      if (fromVideo && !hasForkedFromVideo) {
        targetProjectId = await forkProjectIfNeeded();
        if (!targetProjectId) {
          setIsSubmitting(false);
          return;
        }
      }
      
      if (!targetProjectId) {
        Alert.alert('Error', 'No project to generate');
        setIsSubmitting(false);
        return;
      }
      
      // Get the latest script from messages
      const latestScript = messages
        .filter(m => m.role === 'assistant' && !m.isLoading)
        .sort((a, b) => b.createdAt - a.createdAt)[0]?.content;
      
      if (!latestScript) {
        Alert.alert('Error', 'No script to approve');
        setIsSubmitting(false);
        return;
      }
      
      // Save the latest script to the project BEFORE submitting
      // This ensures the script is persisted in the DB even if it was only edited locally
      // (e.g. after forking from history, the forked project may not have the edited script yet)
      await updateProjectScript({
        id: targetProjectId as any,
        script: latestScript.replace(/\?(?!\?\?)/g, '???'),
      });
      
      // Mark project as submitted FIRST (changes backend status to 'processing')
      // This must happen before addVideo to prevent a race condition:
      // If addVideo runs first, the polling service sees local status 'processing' but backend still 'failed',
      // which triggers a false failure notification
      await markProjectSubmitted({ id: targetProjectId as any });
      
      // Now add video to context with processing status (polling will see consistent state)
      addVideo({
        id: targetProjectId,
        uri: '',
        prompt: inputText || 'Chat-generated video',
        script: latestScript.replace(/\?\?\?/g, '?'),
        createdAt: Date.now(),
        status: 'processing',
        projectId: targetProjectId,
        thumbnailUrl: mediaUris[0]?.uri,
      });
      
      Alert.alert(
        '🎬 Generation Started!',
        'Your video is being created! Feel free to close the app — we\'ll send you a notification when it\'s ready.',
        [{
          text: 'Got it!',
          style: 'default',
          onPress: () => {
            router.replace('/(tabs)');
          }
        }]
      );
    } catch (error) {
      console.error('Error approving:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('FREE_TIER_LIMIT_REACHED')) {
        router.push('/paywall');
      } else {
        Alert.alert('Error', 'Failed to start generation. Please try again.');
      }
      setIsSubmitting(false);
    }
  };
  
  // Voice config modal handlers (progressive disclosure)
  const handleVoiceConfigComplete = () => {
    setShowVoiceConfigModal(false);
    hasShownVoicePromptRef.current = true;
    
    // Clear audio cache so new audio is generated with the new voice
    audioCache.current.clear();
    
    // Skip voice check for the next action (voice was just configured)
    skipVoiceCheckRef.current = true;
    
    // Execute the pending action after voice is configured
    const action = pendingVoiceAction;
    setPendingVoiceAction(null);
    
    // Use setTimeout to ensure modal closes before re-triggering action
    setTimeout(() => {
      if (action?.type === 'play' && action.messageId && action.content) {
        // Re-trigger play voice (now that voice is configured)
        handlePlayVoice(action.messageId, action.content);
      } else if (action?.type === 'submit') {
        // Re-trigger approve and generate
        handleApproveAndGenerate();
      }
      // Reset skip flag after action is triggered
      skipVoiceCheckRef.current = false;
    }, 200);
  };
  
  const handleVoiceConfigSkip = () => {
    setShowVoiceConfigModal(false);
    hasShownVoicePromptRef.current = true;
    
    // Skip voice check for the next action (user chose to skip)
    skipVoiceCheckRef.current = true;
    
    // Execute the pending action with default voice
    const action = pendingVoiceAction;
    setPendingVoiceAction(null);
    
    // Use setTimeout to ensure modal closes before re-triggering action
    setTimeout(() => {
      if (action?.type === 'play' && action.messageId && action.content) {
        // Re-trigger play voice (will use default voice)
        handlePlayVoice(action.messageId, action.content);
      } else if (action?.type === 'submit') {
        // Re-trigger approve and generate (will use default voice)
        handleApproveAndGenerate();
      }
      // Reset skip flag after action is triggered
      skipVoiceCheckRef.current = false;
    }, 200);
  };
  
  const handleVoiceConfigClose = () => {
    setShowVoiceConfigModal(false);
    setPendingVoiceAction(null);
    // Don't mark as shown - user explicitly closed without deciding
  };
  
  // Chat onboarding tips: measure target elements and show overlay
  const measureSpotlightRects = useCallback(() => {
    const refs = [scriptBubbleRef, threeDotsRef, composerRef, generateButtonRef];
    const measured: (SpotlightRect | null)[] = [];
    let remaining = refs.length;
    
    refs.forEach((ref, index) => {
      if (ref.current) {
        ref.current.measureInWindow((x, y, width, height) => {
          measured[index] = { x, y, width, height };
          remaining--;
          if (remaining === 0) {
            setSpotlightRects([...measured]);
          }
        });
      } else {
        measured[index] = null;
        remaining--;
        if (remaining === 0) {
          setSpotlightRects([...measured]);
        }
      }
    });
  }, []);

  const triggerChatOnboarding = useCallback(() => {
    const shouldShowTips = ENABLE_TEST_RUN_MODE || !backendUser?.chatTipsCompleted;
    if (shouldShowTips) {
      // Wait for the script bubble to render, then measure and show immediately
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          measureSpotlightRects();
          setShowChatOnboarding(true);
        });
      });
    }
  }, [backendUser, measureSpotlightRects]);
  
  const handleChatOnboardingComplete = useCallback(async () => {
    setShowChatOnboarding(false);
    if (userId && !ENABLE_TEST_RUN_MODE) {
      try {
        await completeChatTips({ userId });
      } catch (e) {
        console.error('Failed to save chat tips completion:', e);
      }
    }
  }, [userId, completeChatTips]);
  
  const handleClose = async () => {
    if (isGenerating) {
      Alert.alert(
        'Script is still generating',
        'You can safely leave this screen. We will keep generating in the background and notify you when it is ready.',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Continue in background',
            onPress: () => router.back(),
          },
        ]
      );
      return;
    }

    // Check if this is an existing draft that was opened (projectId param was provided)
    const isExistingDraft = !!projectId && !fromVideo;
    
    // Check if we created a new project during this session
    const isNewlyCreatedProject = createdProjectId && !projectId;
    
    // If opening an existing draft without changes, exit silently
    if (isExistingDraft && !hasForkedFromVideo) {
      router.back();
      return;
    }
    
    // If we came from a video and forked (made changes), show the new draft notice
    if (fromVideo && hasForkedFromVideo) {
      Alert.alert(
        'Draft Created',
        'Your changes have been saved as a new draft. The original video remains unchanged.',
        [
          { 
            text: 'OK', 
            onPress: () => router.back() 
          }
        ]
      );
      return;
    }
    
    // If we came from a video but didn't make any changes, just go back
    if (fromVideo && !hasForkedFromVideo) {
      router.back();
      return;
    }
    
    // For newly created chats with content, show the save notice
    const hasContent = mediaUris.length > 0 || messages.length > 0 || inputText.trim();
    if (isNewlyCreatedProject || hasContent) {
      Alert.alert(
        'Draft Saved',
        'Your draft will be saved in the Drafts tab. You can continue later.',
        [
          { 
            text: 'OK', 
            onPress: () => router.back() 
          }
        ]
      );
    } else {
      router.back();
    }
  };
  
  const isLimitReached = userMessageCount >= MAX_USER_MESSAGES;
  const selectedMedia = mediaUris.filter(m => !sentMediaIds.has(m.id));
  const uploadedMedia = mediaUris.filter(m => m.storageId);
  const pendingMedia = mediaUris.filter(m => m.storageId && !sentMediaIds.has(m.id));
  const hasPendingMedia = pendingMedia.length > 0;
  const hasNewInput = inputText.trim().length > 0;
  const allSelectedMediaReady = selectedMedia.every(
    (media) => media.uploadStatus === 'uploaded' && media.thumbnailLoaded
  );
  
  // Before first message: can send if we have media (even without text)
  // After first message: can send if we have new text input OR new pending media
  const canSend = messages.length === 0 
    ? (uploadedMedia.length > 0 && allSelectedMediaReady && !isGenerating)  // First message: need media
    : ((hasNewInput || hasPendingMedia) && allSelectedMediaReady && !isGenerating && !isLimitReached);  // Subsequent: need text or new media
  
  // Determine if send button should act as "Regenerate" 
  // This happens when coming from video without any modifications
  const isRegenerateMode = fromVideo && !hasForkedFromVideo && hasScript && !hasNewInput && !hasPendingMedia && !isGenerating && !isRegenerating;
  
  // Determine if send button should act as "Approve & Generate"
  // This happens when we have a script, no new text input, no pending media, and not generating/submitting (but not regenerate mode)
  const isApproveMode = !isRegenerateMode && hasScript && !hasNewInput && !hasPendingMedia && !isGenerating && !isSubmitting;
  
  // Generate header button is active when we can approve OR regenerate (history chats + drafts)
  const isGenerateActive = isApproveMode || isRegenerateMode;
  const isGenerateBusy = isSubmitting || isRegenerating;
  
  // Find latest assistant message for edit functionality
  const latestAssistantMessageId = messages
    .filter(m => m.role === 'assistant' && !m.isLoading)
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.id;
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
          <ArrowLeft size={24} color={Colors.ink} />
        </TouchableOpacity>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            ref={generateButtonRef}
            style={[styles.generateButton, !isGenerateActive && styles.generateButtonDisabled]}
            onPress={isRegenerateMode ? handleRegenerateFromVideo : handleApproveAndGenerate}
            disabled={!isGenerateActive || isGenerateBusy}
            activeOpacity={0.8}
          >
            {isGenerateBusy ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={[styles.generateButtonText, !isGenerateActive && styles.generateButtonTextDisabled]}>Generate</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            ref={threeDotsRef}
            style={styles.threeDotsButton}
            onPress={() => setShowMenu(prev => !prev)}
          >
            <MoreHorizontal size={20} color={Colors.ink} />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Three-dots popover menu */}
      {showMenu && (
        <>
          <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)} />
          <View style={[styles.menuContainer, { top: insets.top + 60 }]}>
            {/* Voice Clone */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setPendingVoiceAction(null);
                setShowVoiceConfigModal(true);
              }}
              activeOpacity={0.6}
            >
              <Mic size={18} color={Colors.ink} />
              <Text style={styles.menuItemText}>Voice Clone</Text>
            </TouchableOpacity>
            
            <View style={styles.menuDivider} />
            
            {/* Voiceover Speed */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                handleChangeSpeed();
              }}
              activeOpacity={0.6}
            >
              <Gauge size={18} color={Colors.ink} />
              <View style={styles.menuItemTextContainer}>
                <Text style={styles.menuItemText}>Voiceover Speed</Text>
                <Text style={styles.menuItemSecondary}>
                  {VOICE_SPEED_OPTIONS.find(o => o.value === voiceSpeed)?.label || 'Normal'}
                </Text>
              </View>
            </TouchableOpacity>
            
            <View style={styles.menuDivider} />
            
            {/* Keep Clips Order */}
            <View style={styles.menuItem}>
              <ListOrdered size={18} color={Colors.ink} />
              <Text style={[styles.menuItemText, { flex: 1 }]}>Keep Clips Order</Text>
              <Switch
                value={keepOrder}
                onValueChange={() => handleToggleKeepOrder()}
                trackColor={{ false: Colors.creamDark, true: Colors.ember }}
                thumbColor={Colors.white}
                ios_backgroundColor={Colors.creamDark}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          </View>
        </>
      )}
      
      {/* Chat Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info banner when viewing chat from a completed video */}
          {fromVideo && !hasForkedFromVideo && (
            <View style={styles.infoBanner}>
              <Info size={16} color={Colors.ember} />
              <Text style={styles.infoBannerText}>
                Any changes will create a new draft. Original video stays unchanged.
              </Text>
            </View>
          )}
          
          {/* Welcome message - hidden when processing media or thumbnails visible */}
          {messages.length === 0 && mediaUris.length === 0 && !isProcessingMedia && (
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeTitle}>Hello, {user?.name || 'there'}!</Text>
              <Text style={styles.welcomeSubtitle}>
                upload media for a video you would like to create
              </Text>
            </View>
          )}
          
          {/* Chat messages */}
          {(() => {
            const firstAssistantIndex = messages.findIndex(m => m.role === 'assistant' && !m.isLoading);
            return messages.map((message, index) => {
              const isFirstAssistant = index === firstAssistantIndex;
              
              const bubble = (
                <ChatBubble
                  key={isFirstAssistant ? undefined : message.id}
                  message={message}
                  onEditTap={() => handleEditScript(message.id, message.content)}
                  onCopy={() => handleCopy(message.id, message.content)}
                  isLatestAssistant={message.id === latestAssistantMessageId}
                  isCopied={copiedMessageId === message.id}
                  onPlayVoice={() => handlePlayVoice(message.id, message.content)}
                  isPlayingVoice={playingMessageId === message.id}
                  isGeneratingVoice={generatingVoiceMessageId === message.id}
                />
              );
              
              if (isFirstAssistant) {
                return (
                  <View key={message.id} ref={scriptBubbleRef} collapsable={false}>
                    {bubble}
                  </View>
                );
              }
              return bubble;
            });
          })()}
          
          {/* Message limit warning */}
          {isLimitReached && (
            <View style={styles.limitWarning}>
              <Text style={styles.limitWarningText}>
                Message limit reached. Edit the script directly or approve to generate.
              </Text>
            </View>
          )}
        </ScrollView>
        
        {/* Unified Composer */}
        <View ref={composerRef} style={[styles.composerContainer, { paddingBottom: keyboardVisible ? 10 : insets.bottom }]}>
          {/* Add media button - outside card */}
          <TouchableOpacity 
            style={styles.addMediaButton}
            onPress={pickMedia}
            disabled={isGenerating}
          >
            <Plus size={24} color={Colors.ink} />
          </TouchableOpacity>
          
          {/* Unified card containing media + input */}
          <View style={styles.composerCard}>
            {/* Media thumbnails inside card - show pending media (not yet sent in a message) */}
            {(() => {
              const pendingMedia = mediaUris.filter(m => !sentMediaIds.has(m.id));
              return pendingMedia.length > 0 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.composerMediaScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {pendingMedia.map((item) => (
                    <View key={item.id} style={styles.composerMediaItem}>
                      {/* Loading placeholder until thumbnail loads */}
                      {!item.thumbnailLoaded && (
                        <View style={styles.composerMediaPlaceholder}>
                          <ActivityIndicator size="small" color={Colors.white} />
                        </View>
                      )}
                      
                      {/* Actual thumbnail - hidden until loaded */}
                      {item.type === 'video' ? (
                        <VideoThumbnail uri={item.uri} style={styles.composerMediaImage} />
                      ) : (
                        <Image 
                          source={{ uri: item.uri }} 
                          style={[
                            styles.composerMediaImage,
                            !item.thumbnailLoaded && styles.composerMediaImageHidden
                          ]} 
                          onLoad={() => markThumbnailLoaded(item.id)}
                        />
                      )}
                      
                      {/* Upload status overlay */}
                      {item.uploadStatus === 'uploading' && (
                        <View style={styles.composerMediaOverlay}>
                          <ActivityIndicator size="small" color={Colors.white} />
                        </View>
                      )}
                      
                      {/* Remove button */}
                      <TouchableOpacity
                        style={styles.composerMediaRemove}
                        onPress={() => removeMedia(item.id)}
                        activeOpacity={0.7}
                      >
                        <X size={16} color={Colors.white} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              );
            })()}
            
            {/* Text input inside card */}
            <TextInput
              ref={inputRef}
              style={styles.composerTextInput}
              placeholder={hasScript ? "Type to edit, or tap → to approve" : "Share your story, or leave it blank..."}
              placeholderTextColor={Colors.gray400}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
              editable={!isLimitReached && !isGenerating}
            />
          </View>
          
          {/* Send/Approve/Regenerate button - outside card */}
          <TouchableOpacity
            style={[
              styles.sendButton, 
              (canSend || isApproveMode || isRegenerateMode) && styles.sendButtonActive,
              (isSubmitting || isRegenerating) && styles.sendButtonDisabled,
            ]}
            onPress={isRegenerateMode ? handleRegenerateFromVideo : (isApproveMode ? handleApproveAndGenerate : handleSend)}
            disabled={isRegenerateMode ? isRegenerating : (isApproveMode ? isSubmitting : !canSend)}
          >
            {(isSubmitting || isRegenerating) ? (
              <ActivityIndicator size={16} color={Colors.white} />
            ) : (
              <View style={(isApproveMode || isRegenerateMode) ? styles.sendIconApprove : undefined}>
                <Send size={20} color={(canSend || isApproveMode || isRegenerateMode) ? Colors.white : Colors.grayLight} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      
      {/* Script Editor Modal */}
      <ScriptEditor
        visible={showEditor}
        script={editingScript}
        onSave={handleSaveEdit}
        onClose={() => setShowEditor(false)}
      />
      
      {/* Full-screen loading overlay while processing media */}
      {isProcessingMedia && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.processingOverlayText}>Loading...</Text>
        </View>
      )}
      
      {/* Voice configuration modal (progressive disclosure) */}
      <VoiceConfigModal
        visible={showVoiceConfigModal}
        onComplete={handleVoiceConfigComplete}
        onSkip={handleVoiceConfigSkip}
        onClose={handleVoiceConfigClose}
      />
      
      {/* Chat onboarding tips overlay */}
      <ChatOnboarding
        visible={showChatOnboarding}
        onComplete={handleChatOnboardingComplete}
        spotlightRects={spotlightRects}
        safeAreaTop={insets.top}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.creamDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  generateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.ember,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  generateButtonDisabled: {
    backgroundColor: Colors.creamDark,
  },
  generateButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Nunito_700Bold',
  },
  generateButtonTextDisabled: {
    color: Colors.grayLight,
  },
  threeDotsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.creamDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  menuContainer: {
    position: 'absolute',
    right: 16,
    width: 220,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 6,
    zIndex: 51,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  menuItemTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuItemText: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.ink,
  },
  menuItemSecondary: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.creamDark,
    marginHorizontal: 16,
  },
  keyboardView: {
    flex: 1,
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 0,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(243, 106, 63, 0.08)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.ember,
    lineHeight: 18,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  welcomeTitle: {
    fontSize: 28,
    fontFamily: Fonts.medium,
    color: Colors.ink,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  messageBubbleContainer: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  messageBubbleContainerUser: {
    alignItems: 'flex-end',
  },
  messageMediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
    maxWidth: '85%',
  },
  messageMediaGridUser: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  messageMediaItem: {
    width: 75,
    height: 75,
    borderRadius: 10,
    overflow: 'hidden',
  },
  messageMediaImage: {
    width: '100%',
    height: '100%',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 16,
  },
  messageBubbleUser: {
    backgroundColor: Colors.ember,
    borderBottomRightRadius: 4,
  },
  messageBubbleAssistant: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.creamDark,
  },
  messageBubbleLoading: {
    minWidth: 0,
  },
  messageText: {
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.ink,
    lineHeight: 22,
  },
  messageTextUser: {
    color: Colors.white,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  scriptLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scriptLoadingText: {
    fontSize: 14,
    fontFamily: Fonts.italic,
    color: Colors.ember,
    flexShrink: 1,
    lineHeight: 20,
  },
  scriptLoadingDots: {
    minWidth: 14,
  },
  editedLabel: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingLeft: 4,
    gap: 2,
  },
  messageActionsUser: {
    alignSelf: 'flex-end',
    paddingLeft: 0,
    paddingRight: 0,
  },
  copyButton: {
    padding: 4,
  },
  actionButton: {
    padding: 6,
    borderRadius: 4,
  },
  actionButtonActive: {
    backgroundColor: 'rgba(243, 106, 63, 0.12)',
  },
  copiedFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  copiedText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.ember,
  },
  scriptHint: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  limitWarning: {
    backgroundColor: 'rgba(243, 106, 63, 0.08)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  limitWarningText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.ember,
    textAlign: 'center',
  },
  // Unified Composer styles
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 15,
    backgroundColor: Colors.cream,
    gap: 8,
  },
  composerCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.creamDark,
  },
  composerMediaScroll: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  composerMediaItem: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.creamDark,
  },
  composerMediaImage: {
    width: '100%',
    height: '100%',
  },
  composerMediaOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerMediaRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerTextInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.medium,
    color: Colors.ink,
    maxHeight: 100,
  },
  composerMediaPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.creamDark,
    zIndex: 1,
  },
  composerMediaImageHidden: {
    opacity: 0,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingOverlayText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: Colors.white,
    marginTop: 12,
  },
  addMediaButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.creamDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.creamDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  sendButtonActive: {
    backgroundColor: Colors.ember,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendIconApprove: {
    transform: [{ rotate: '45deg' }],
    right: 2,
  },
  editorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.cream,
    zIndex: 100,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.creamDark,
  },
  editorCloseButton: {
    padding: 8,
  },
  editorTitle: {
    fontSize: 18,
    fontFamily: Fonts.medium,
    color: Colors.ink,
  },
  editorSaveButton: {
    padding: 8,
  },
  editorInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.ink,
    lineHeight: 24,
  },
});
