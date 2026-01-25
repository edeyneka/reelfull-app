import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Send, X, Check, Info, Copy, MessageSquare } from 'lucide-react-native';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { VideoExportPreset } from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import * as Clipboard from 'expo-clipboard';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { uploadMediaFiles } from '@/lib/api-helpers';
import { Fonts } from '@/constants/typography';
import { LocalChatMessage } from '@/types';

const MAX_USER_MESSAGES = 10;

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

// Overlay loader component
function OverlayLoader({ 
  title, 
  subtitle, 
  showWarning = false,
  progress,
}: { 
  title: string; 
  subtitle?: string;
  showWarning?: boolean;
  progress?: { current: number; total: number };
}) {
  const percent = progress ? Math.round((progress.current / progress.total) * 100) : 0;
  
  return (
    <View style={styles.overlayLoader}>
      <View style={styles.loaderContent}>
        <ActivityIndicator size="large" color={Colors.orange} />
        <Text style={styles.loaderTitle}>{title}</Text>
        {progress ? (
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

// Media grid display component
function MediaGrid({ 
  media, 
  onRemove, 
  expanded = false,
  onToggleExpand,
}: { 
  media: Array<{ uri: string; type: 'image' | 'video'; id: string }>;
  onRemove: (index: number) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const displayItems = expanded ? media : media.slice(0, 5);
  const remainingCount = media.length - 5;
  
  return (
    <View style={styles.mediaGridContainer}>
      <View style={styles.mediaGrid}>
        {displayItems.map((item, index) => (
          <View key={item.id} style={styles.mediaGridItem}>
            {item.type === 'video' ? (
              <VideoThumbnail uri={item.uri} style={styles.mediaGridImage} />
            ) : (
              <Image source={{ uri: item.uri }} style={styles.mediaGridImage} />
            )}
            <TouchableOpacity
              style={styles.mediaRemoveButton}
              onPress={() => onRemove(index)}
              activeOpacity={0.7}
            >
              <X size={14} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ))}
        {!expanded && remainingCount > 0 && (
          <TouchableOpacity 
            style={styles.mediaGridItem} 
            onPress={onToggleExpand}
            activeOpacity={0.7}
          >
            <View style={styles.moreMediaOverlay}>
              <Text style={styles.moreMediaText}>+{remainingCount}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
      {expanded && media.length > 6 && (
        <TouchableOpacity onPress={onToggleExpand} style={styles.collapseButton}>
          <Text style={styles.collapseButtonText}>Show less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Chat message bubble component
function ChatBubble({ 
  message, 
  onEditTap, 
  onCopy,
  isLatestAssistant,
}: { 
  message: LocalChatMessage;
  onEditTap?: () => void;
  onCopy?: () => void;
  isLatestAssistant: boolean;
}) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
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
      {message.content && (
        <Pressable 
          style={[
            styles.messageBubble, 
            isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
            message.isLoading && styles.messageBubbleLoading,
          ]}
          onPress={isAssistant && isLatestAssistant ? onEditTap : undefined}
          onLongPress={isAssistant ? onCopy : undefined}
        >
          {message.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.orange} />
              <Text style={styles.loadingText}>Generating your script...</Text>
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
      
      {/* Copy hint for assistant messages */}
      {isAssistant && !message.isLoading && (
        <View style={styles.messageActions}>
          <TouchableOpacity onPress={onCopy} style={styles.copyButton}>
            <Copy size={14} color={Colors.grayLight} />
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
          <X size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.editorTitle}>Edit Script</Text>
        <TouchableOpacity onPress={() => onSave(editedScript)} style={styles.editorSaveButton}>
          <Check size={24} color={Colors.orange} />
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.editorInput}
        value={editedScript.replace(/\?\?\?/g, '?')}
        onChangeText={setEditedScript}
        multiline
        textAlignVertical="top"
        autoFocus
        placeholderTextColor={Colors.grayLight}
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
  const [mediaUris, setMediaUris] = useState<Array<{ 
    uri: string; 
    type: 'image' | 'video'; 
    id: string;
    assetId?: string;
    storageId?: any;
  }>>([]);
  const [isPickingMedia, setIsPickingMedia] = useState(false);
  const [showUploadOverlay, setShowUploadOverlay] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasScript, setHasScript] = useState(false);
  const [userMessageCount, setUserMessageCount] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [editingScript, setEditingScript] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(projectId || null);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
        const loadedMessages: LocalChatMessage[] = existingMessages.map((msg: any) => ({
          id: msg._id,
          role: msg.role,
          content: msg.content,
          isEdited: msg.isEdited,
          createdAt: msg.createdAt,
        }));
        setMessages(loadedMessages);
        setUserMessageCount(existingProject.userMessageCount || 0);
        
        // Check if there's already a script
        const hasAssistantMessage = loadedMessages.some(m => m.role === 'assistant');
        setHasScript(hasAssistantMessage);
      }
    }
  }, [existingProject, existingMessages, projectId]);
  
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
  
  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant permission to access your photos.');
      return;
    }
    
    const loadingTimeout = setTimeout(() => setIsPickingMedia(true), 2000);
    
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
        setShowUploadOverlay(true);
        
        const baseTimestamp = Date.now();
        const newMedia = result.assets.map((asset, index) => ({
          uri: asset.uri,
          type: (asset.type === 'video' ? 'video' : 'image') as 'video' | 'image',
          id: `${baseTimestamp + index}`,
          assetId: asset.assetId ?? undefined,
        }));
        
        const allMedia = [...mediaUris, ...newMedia];
        setMediaUris(allMedia);
        
        await uploadMedia(allMedia, newMedia);
      }
    } catch (error) {
      clearTimeout(loadingTimeout);
      setIsPickingMedia(false);
      setShowUploadOverlay(false);
      console.error('Error picking media:', error);
    }
  };
  
  const uploadMedia = async (allMedia: typeof mediaUris, newMediaOnly: typeof mediaUris) => {
    const filesToUpload = newMediaOnly.filter(m => !m.storageId);
    
    if (filesToUpload.length === 0) {
      setShowUploadOverlay(false);
      inputRef.current?.focus();
      return;
    }
    
    setUploadProgress({ current: 0, total: filesToUpload.length });
    
    try {
      const updatedMedia = [...allMedia];
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i];
        setUploadProgress({ current: i, total: filesToUpload.length });
        
        try {
          const uploadResult = await uploadMediaFiles(
            generateUploadUrl,
            [{ uri: item.uri, type: item.type, assetId: item.assetId }]
          );
          
          const mediaIndex = updatedMedia.findIndex(m => m.id === item.id);
          if (mediaIndex !== -1 && uploadResult[0]) {
            updatedMedia[mediaIndex] = {
              ...updatedMedia[mediaIndex],
              storageId: uploadResult[0].storageId,
            };
          }
        } catch (error) {
          console.error('Failed to upload file', i, error);
          throw error;
        }
      }
      
      setUploadProgress({ current: filesToUpload.length, total: filesToUpload.length });
      setMediaUris(updatedMedia);
      setShowUploadOverlay(false);
      
      // Focus input after upload
      setTimeout(() => inputRef.current?.focus(), 100);
      
      // If we already have messages and added new media, trigger script regeneration
      if (messages.length > 0 && hasScript) {
        await handleNewMediaAdded(newMediaOnly.length);
      }
    } catch (error) {
      setShowUploadOverlay(false);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Upload Failed', errorMessage);
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
  
  const removeMedia = (index: number) => {
    setMediaUris(prev => prev.filter((_, i) => i !== index));
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
      // Create project if it doesn't exist
      let currentProjectId = createdProjectId;
      
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
      await addChatMessage({
        projectId: currentProjectId,
        role: 'user',
        content: userInput || 'Generate a script based on my media',
        messageIndex: userMessageCount + 1,
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
      
      // Get image URLs for analysis
      const uploadedMedia = mediaUris.filter(m => m.storageId);
      const imageUrls = await Promise.all(
        uploadedMedia.map(async (m) => {
          // Get URL from storage
          return m.uri; // Use the uploaded URL
        })
      );
      
      // Generate script
      const result = await generateChatScript({
        projectId: currentProjectId,
        conversationHistory,
        imageUrls,
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
    if (!editingMessageId || !createdProjectId) return;
    
    // Update local message
    setMessages(prev => prev.map(m => 
      m.id === editingMessageId 
        ? { ...m, content: newScript, isEdited: true }
        : m
    ));
    
    // Update in backend if it's a real message ID (not local)
    if (!editingMessageId.startsWith('assistant-') && !editingMessageId.startsWith('user-')) {
      try {
        await updateChatMessage({
          messageId: editingMessageId as any,
          content: newScript.replace(/\?(?!\?\?)/g, '???'),
        });
      } catch (error) {
        console.error('Failed to update message:', error);
      }
    } else {
      // Update project script directly for local messages
      try {
        await updateProjectScript({
          id: createdProjectId as any,
          script: newScript.replace(/\?(?!\?\?)/g, '???'),
        });
      } catch (error) {
        console.error('Failed to update script:', error);
      }
    }
    
    setShowEditor(false);
    setEditingMessageId(null);
  };
  
  const handleCopy = async (content: string) => {
    try {
      await Clipboard.setStringAsync(content.replace(/\?\?\?/g, '?'));
    } catch (error) {
      console.error('Copy error:', error);
    }
  };
  
  const handleApproveAndGenerate = async () => {
    if (!createdProjectId || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
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
        id: createdProjectId,
        uri: '',
        prompt: inputText || 'Chat-generated video',
        script: latestScript.replace(/\?\?\?/g, '?'),
        createdAt: Date.now(),
        status: 'processing',
        projectId: createdProjectId,
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
      await markProjectSubmitted({ id: createdProjectId as any });
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
  
  const handleClose = () => {
    router.back();
  };
  
  const isLimitReached = userMessageCount >= MAX_USER_MESSAGES;
  const uploadedMedia = mediaUris.filter(m => m.storageId);
  const canSend = (inputText.trim() || uploadedMedia.length > 0) && !isGenerating && !isLimitReached;
  
  // Find latest assistant message for edit functionality
  const latestAssistantMessageId = messages
    .filter(m => m.role === 'assistant' && !m.isLoading)
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.id;
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
          <ArrowLeft size={24} color={Colors.white} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.infoButton}>
          <Info size={20} color={Colors.grayLight} />
        </TouchableOpacity>
        
        {hasScript && (
          <TouchableOpacity 
            style={[styles.approveButton, isSubmitting && styles.approveButtonDisabled]}
            onPress={handleApproveAndGenerate}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.approveButtonText}>Approve & Generate</Text>
            )}
          </TouchableOpacity>
        )}
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
          {/* Welcome message */}
          {messages.length === 0 && uploadedMedia.length === 0 && (
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeTitle}>Hello, {user?.name || 'there'}!</Text>
              <Text style={styles.welcomeSubtitle}>
                upload media for a video you'd like to create
              </Text>
            </View>
          )}
          
          {/* Media preview (before first message) */}
          {uploadedMedia.length > 0 && messages.length === 0 && (
            <View style={styles.mediaPreviewContainer}>
              <MediaGrid
                media={uploadedMedia}
                onRemove={removeMedia}
                expanded={mediaExpanded}
                onToggleExpand={() => setMediaExpanded(!mediaExpanded)}
              />
            </View>
          )}
          
          {/* Chat messages */}
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              onEditTap={() => handleEditScript(message.id, message.content)}
              onCopy={() => handleCopy(message.content)}
              isLatestAssistant={message.id === latestAssistantMessageId}
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
        
        {/* Input Area */}
        <View style={[styles.inputArea, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity 
            style={styles.addMediaButton}
            onPress={pickMedia}
            disabled={isGenerating}
          >
            <Plus size={24} color={Colors.white} />
          </TouchableOpacity>
          
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder={hasScript ? "Ask anything" : "Share your story, or leave it blank..."}
            placeholderTextColor={Colors.grayLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!isLimitReached && !isGenerating}
          />
          
          <TouchableOpacity
            style={[styles.sendButton, canSend && styles.sendButtonActive]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <Send size={20} color={canSend ? Colors.white : Colors.grayLight} />
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
      
      {/* Upload Overlay */}
      {(isPickingMedia || showUploadOverlay) && (
        <OverlayLoader
          title="Uploading..."
          progress={showUploadOverlay ? uploadProgress : undefined}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveButton: {
    flex: 1,
    backgroundColor: Colors.grayDark,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  approveButtonDisabled: {
    opacity: 0.5,
  },
  approveButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: Fonts.title,
  },
  keyboardView: {
    flex: 1,
  },
  chatArea: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 100,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  welcomeTitle: {
    fontSize: 28,
    fontFamily: Fonts.title,
    color: Colors.white,
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    textAlign: 'center',
  },
  mediaPreviewContainer: {
    marginBottom: 16,
  },
  mediaGridContainer: {
    gap: 8,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaGridItem: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.gray,
  },
  mediaGridImage: {
    width: '100%',
    height: '100%',
  },
  mediaRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreMediaOverlay: {
    flex: 1,
    backgroundColor: Colors.grayDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreMediaText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  collapseButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  collapseButtonText: {
    fontSize: 12,
    color: Colors.orange,
    fontFamily: Fonts.regular,
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
    backgroundColor: Colors.orange,
    borderBottomRightRadius: 4,
  },
  messageBubbleAssistant: {
    backgroundColor: Colors.grayDark,
    borderBottomLeftRadius: 4,
  },
  messageBubbleLoading: {
    minWidth: 200,
  },
  messageText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.white,
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
    color: Colors.grayLight,
  },
  editedLabel: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginTop: 4,
    fontStyle: 'italic',
  },
  messageActions: {
    flexDirection: 'row',
    marginTop: 4,
    paddingLeft: 8,
  },
  copyButton: {
    padding: 4,
  },
  limitWarning: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  limitWarningText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.orange,
    textAlign: 'center',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.black,
    borderTopWidth: 1,
    borderTopColor: Colors.gray,
    gap: 8,
  },
  addMediaButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.grayDark,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.white,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  sendButtonActive: {
    backgroundColor: Colors.orange,
  },
  editorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.black,
    zIndex: 100,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray,
  },
  editorCloseButton: {
    padding: 8,
  },
  editorTitle: {
    fontSize: 18,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  editorSaveButton: {
    padding: 8,
  },
  editorInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    lineHeight: 24,
  },
  overlayLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.black,
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
});
