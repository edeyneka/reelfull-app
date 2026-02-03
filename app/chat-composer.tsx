import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Send, X, Check, Info, Copy, MessageSquare, Volume2, Gauge, ListOrdered, Loader2, VolumeX } from 'lucide-react-native';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoExportPreset } from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { uploadMediaFiles } from '@/lib/api-helpers';
import { Fonts } from '@/constants/typography';
import { LocalChatMessage } from '@/types';

const MAX_USER_MESSAGES = 10;

// Voice speed options
const VOICE_SPEED_OPTIONS = [
  { label: 'Slow', value: 1.0 },
  { label: 'Normal', value: 1.08 },
  { label: 'Fast', value: 1.15 },
  { label: 'Very Fast', value: 1.25 },
];

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
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount(prev => prev >= 3 ? 1 : prev + 1);
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  const dots = '.'.repeat(dotCount);
  // Pad with invisible dots to prevent text from shifting
  const padding = '\u00A0'.repeat(3 - dotCount);
  
  return (
    <Text style={styles.scriptLoadingText}>
      Generating script{dots}{padding}
    </Text>
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
  voiceSpeed,
  onChangeSpeed,
  keepOrder,
  onToggleKeepOrder,
}: { 
  message: LocalChatMessage;
  onEditTap?: () => void;
  onCopy?: () => void;
  isLatestAssistant: boolean;
  isCopied?: boolean;
  onPlayVoice?: () => void;
  isPlayingVoice?: boolean;
  isGeneratingVoice?: boolean;
  voiceSpeed?: number;
  onChangeSpeed?: () => void;
  keepOrder?: boolean;
  onToggleKeepOrder?: () => void;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  // Get speed label for display
  const getSpeedLabel = () => {
    const option = VOICE_SPEED_OPTIONS.find(o => o.value === voiceSpeed);
    return option?.label || 'Normal';
  };
  
  return (
    <View style={[styles.messageBubbleContainer, isUser && styles.messageBubbleContainerUser]}>
      {/* Media display for user messages */}
      {message.mediaUris && message.mediaUris.length > 0 && (
        <View style={styles.messageMediaGrid}>
          {message.mediaUris.slice(0, 4).map((media, index) => (
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
          
          {/* Speed selector button */}
          <TouchableOpacity onPress={onChangeSpeed} style={styles.actionButton}>
            <Gauge size={14} color={Colors.textSecondary} />
          </TouchableOpacity>
          
          {/* Keep order toggle */}
          <TouchableOpacity 
            onPress={onToggleKeepOrder} 
            style={[styles.actionButton, keepOrder && styles.actionButtonActive]}
          >
            <ListOrdered size={14} color={keepOrder ? Colors.accent : Colors.grayLight} />
          </TouchableOpacity>
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
  
  // State
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [mediaUris, setMediaUris] = useState<PendingMedia[]>([]);
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
  
  const hasAutoOpenedPicker = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  
  // Convex hooks
  const generateUploadUrl = useMutation(api.tasks.generateUploadUrl);
  const createChatProject = useMutation(api.tasks.createChatProject);
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
  
  // Track if we've already tried to refresh R2 URLs for this project
  const hasAttemptedR2Refresh = useRef(false);
  
  // Fetch existing project data if projectId is provided
  const existingProject = useQuery(
    api.tasks.getProject,
    projectId ? { id: projectId } : "skip"
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
        setMessages(loadedMessages);
        setUserMessageCount(existingProject.userMessageCount || 0);
        
        // Check if there's already a script
        const hasAssistantMessage = loadedMessages.some(m => m.role === 'assistant');
        setHasScript(hasAssistantMessage);
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
  
  // Auto-open media picker for new projects
  useEffect(() => {
    if (!projectId && !hasAutoOpenedPicker.current && messages.length === 0) {
      hasAutoOpenedPicker.current = true;
      setTimeout(() => pickMedia(), 300);
    }
  }, [projectId, messages.length]);
  
  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);
  
  // Scroll to bottom when keyboard appears
  useEffect(() => {
    const scrollToBottom = () => {
      // Scroll immediately
      scrollViewRef.current?.scrollToEnd({ animated: true });
      // And again after keyboard animation completes
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 350);
    };
    
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      scrollToBottom
    );
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      scrollToBottom
    );
    
    return () => {
      keyboardWillShowListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);
  
  const pickMedia = async () => {
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
        const baseTimestamp = Date.now();
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
    
    for (const item of filesToUpload) {
      try {
        const uploadResult = await uploadMediaFiles(
          generateUploadUrl,
          [{ uri: item.uri, type: item.type, assetId: item.assetId }]
        );
        
        // Update individual item status
        setMediaUris(prev => prev.map(m => 
          m.id === item.id 
            ? { ...m, uploadStatus: 'uploaded' as const, storageId: uploadResult[0]?.storageId }
            : m
        ));
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
    
    // Focus input after all uploads
    setTimeout(() => inputRef.current?.focus(), 100);
    
    // If we already have messages and added new media, trigger script regeneration
    if (messages.length > 0 && hasScript) {
      await handleNewMediaAdded(newMediaOnly.length);
    }
  };
  
  const handleNewMediaAdded = async (newMediaCount: number) => {
    // Add a system message about new media
    const mediaMessage: LocalChatMessage = {
      id: `media-${Date.now()}`,
      role: 'user',
      content: `Added ${newMediaCount} new photo${newMediaCount > 1 ? 's' : ''}`,
      createdAt: Date.now(),
    };
    
    setMessages(prev => [...prev, mediaMessage]);
    await generateScript(`Added ${newMediaCount} new media`, true, newMediaCount);
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
    const uploadedMedia = mediaUris.filter(m => m.storageId);
    
    // Check message limit
    if (userMessageCount >= MAX_USER_MESSAGES) {
      Alert.alert(
        'Message Limit Reached',
        'You can edit the script directly by tapping on it, or approve and generate your video.'
      );
      return;
    }
    
    // Need either media or text for first message
    if (!hasScript && uploadedMedia.length === 0) {
      Alert.alert('No Media', 'Please add some photos or videos first.');
      return;
    }
    
    Keyboard.dismiss();
    
    // Create user message
    const userMessage: LocalChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      mediaUris: !hasScript && uploadedMedia.length > 0 ? uploadedMedia : undefined,
      createdAt: Date.now(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setUserMessageCount(prev => prev + 1);
    
    await generateScript(inputText.trim());
  };
  
  const generateScript = async (userInput: string, isNewMedia = false, newMediaCount = 0) => {
    setIsGenerating(true);
    
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
      let currentProjectId = createdProjectId;
      if (fromVideo && !hasForkedFromVideo) {
        currentProjectId = await forkProjectIfNeeded();
        if (!currentProjectId) {
          setMessages(prev => prev.filter(m => !m.isLoading));
          setIsGenerating(false);
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
        
        setCreatedProjectId(currentProjectId);
        
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
      await addChatMessage({
        projectId: currentProjectId,
        role: 'user',
        content: userInput || 'Generate a script based on my media',
        messageIndex: userMessageCount + 1,
        // Attach media IDs to the first message only (when no script exists yet)
        mediaIds: !hasScript && uploadedMediaForMessage.length > 0 
          ? uploadedMediaForMessage.map(m => m.storageId).filter(Boolean) as any
          : undefined,
      });
      
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
      
      // Generate script
      const result = await generateChatScript({
        projectId: currentProjectId,
        conversationHistory,
        storageIds,
        isFirstMessage: !hasScript,
        isNewMedia,
        newMediaCount,
      });
      
      // Remove loading message and add real response
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
      
      // Store assistant message in backend
      if (result.success && result.script) {
        await addChatMessage({
          projectId: currentProjectId,
          role: 'assistant',
          content: result.script,
        });
        
        // Update project script
        await updateProjectScript({
          id: currentProjectId,
          script: result.script,
        });
        
        setHasScript(true);
      }
    } catch (error) {
      console.error('Error generating script:', error);
      setMessages(prev => prev.filter(m => !m.isLoading));
      Alert.alert('Error', 'Failed to generate script. Please try again.');
    } finally {
      setIsGenerating(false);
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
    
    // Update local message
    setMessages(prev => prev.map(m => 
      m.id === editingMessageId 
        ? { ...m, content: newScript, isEdited: true }
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
  
  // Voice preview handlers
  const handlePlayVoice = async (messageId: string, content: string) => {
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

        router.replace('/(tabs)');
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
      
      // Add video to context with processing status
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
      
      // Mark project as submitted (triggers backend generation)
      await markProjectSubmitted({ id: targetProjectId as any });
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
  
  const handleClose = async () => {
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
  const uploadedMedia = mediaUris.filter(m => m.storageId);
  const hasNewInput = inputText.trim().length > 0;
  
  // Before first message: can send if we have media (even without text)
  // After first message: can only send if we have new text input
  const canSend = messages.length === 0 
    ? (uploadedMedia.length > 0 && !isGenerating)  // First message: need media
    : (hasNewInput && !isGenerating && !isLimitReached);  // Subsequent: need text
  
  // Determine if send button should act as "Regenerate" 
  // This happens when coming from video without any modifications
  const isRegenerateMode = fromVideo && !hasForkedFromVideo && hasScript && !hasNewInput && !isGenerating && !isRegenerating;
  
  // Determine if send button should act as "Approve & Generate"
  // This happens when we have a script, no new text input, and not generating/submitting (but not regenerate mode)
  const isApproveMode = !isRegenerateMode && hasScript && !hasNewInput && !isGenerating && !isSubmitting;
  
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
        
        <TouchableOpacity 
          style={styles.infoButton}
          onPress={() => Alert.alert(
            'How it works',
            'The last generated script will be used for your video creation. You can edit or regenerate the script before approving.'
          )}
        >
          <Info size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
      
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
                upload media for a video you'd like to create
              </Text>
            </View>
          )}
          
          {/* Chat messages */}
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              onEditTap={() => handleEditScript(message.id, message.content)}
              onCopy={() => handleCopy(message.id, message.content)}
              isLatestAssistant={message.id === latestAssistantMessageId}
              isCopied={copiedMessageId === message.id}
              onPlayVoice={() => handlePlayVoice(message.id, message.content)}
              isPlayingVoice={playingMessageId === message.id}
              isGeneratingVoice={generatingVoiceMessageId === message.id}
              voiceSpeed={voiceSpeed}
              onChangeSpeed={handleChangeSpeed}
              keepOrder={keepOrder}
              onToggleKeepOrder={handleToggleKeepOrder}
            />
          ))}
          
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
        <View style={[styles.composerContainer, { paddingBottom: insets.bottom }]}>
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
            {/* Media thumbnails inside card - only before first message */}
            {mediaUris.length > 0 && messages.length === 0 && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.composerMediaScroll}
              >
                {mediaUris.map((item) => (
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
            )}
            
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.creamDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
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
    maxWidth: '80%',
  },
  messageMediaItem: {
    width: 60,
    height: 60,
    borderRadius: 8,
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
    minWidth: 200,
  },
  messageText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
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
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  scriptLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scriptLoadingText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    fontStyle: 'italic',
    color: Colors.ember,
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
    fontFamily: Fonts.regular,
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
    fontFamily: Fonts.regular,
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
