import { useRouter } from 'expo-router';
import { ArrowLeft, User, Palette, Edit2, Check, X, Mic, Volume2, Headphones, LogOut } from 'lucide-react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Audio } from 'expo-av';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { StylePreference, BackendStyle } from '@/types';
import VoiceRecorder from '@/components/VoiceRecorder';
import { uploadFileToConvex, mapStyleToBackend, mapStyleToApp } from '@/lib/api-helpers';
import { Fonts } from '@/constants/typography';

const STYLE_OPTIONS: StylePreference[] = ['Playful', 'Professional', 'Dreamy'];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, saveUser, clearData } = useApp();
  
  // Convex queries
  const user = useQuery(api.users.getCurrentUser, userId ? { userId } : "skip");
  const defaultVoices = useQuery(api.users.getDefaultVoices);
  
  // Convex mutations and actions
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const updateProfile = useAction(api.users.updateProfile);
  const updateSelectedVoice = useMutation(api.users.updateSelectedVoice);
  
  // Local state
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingStyle, setIsEditingStyle] = useState(false);
  const [isEditingVoice, setIsEditingVoice] = useState(false);
  const [isSelectingVoice, setIsSelectingVoice] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedStyle, setEditedStyle] = useState<StylePreference | null>(null);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);
  const [previewStorageId, setPreviewStorageId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Animated values for slide gesture
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  
  // Get preview URL for the voice being previewed
  const previewUrl = useQuery(
    api.users.getVoicePreviewUrl,
    previewStorageId ? { storageId: previewStorageId as any } : "skip"
  );

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

  // Initialize edited values from user data
  useEffect(() => {
    if (user) {
      setEditedName(user.name || '');
      setEditedStyle(user.preferredStyle ? mapStyleToApp(user.preferredStyle) : null);
    }
  }, [user]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync().catch(console.error);
      }
    };
  }, [sound]);

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

  const playPreviewAudio = useCallback(async (url: string) => {
    try {
      // Load and play preview
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );

      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingPreviewId(null);
          setPreviewStorageId(null);
          setSound(null);
        }
      });
    } catch (error) {
      console.error('Play preview error:', error);
      Alert.alert('Error', 'Failed to play preview');
      setPlayingPreviewId(null);
      setPreviewStorageId(null);
    }
  }, []);

  // Play preview when URL is available
  useEffect(() => {
    if (previewUrl && previewStorageId && playingPreviewId) {
      playPreviewAudio(previewUrl);
    }
  }, [previewUrl, previewStorageId, playingPreviewId, playPreviewAudio]);

  const handleSaveName = async () => {
    if (!userId || !editedName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setIsLoading(true);
    try {
      await updateProfile({
        userId,
        name: editedName.trim(),
      });
      
      // Update local context
      await saveUser({ 
        name: editedName.trim(), 
        style: editedStyle || 'Professional',
        voiceRecordingUri: user?.voiceRecordingUrl 
      });
      
      setIsEditingName(false);
      Alert.alert('Success', 'Name updated successfully');
    } catch (error) {
      console.error('Update name error:', error);
      Alert.alert('Error', 'Failed to update name');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelName = () => {
    setEditedName(user?.name || '');
    setIsEditingName(false);
  };

  const handleSaveStyle = async () => {
    if (!userId || !editedStyle) {
      Alert.alert('Error', 'Please select a style');
      return;
    }

    setIsLoading(true);
    try {
      await updateProfile({
        userId,
        preferredStyle: mapStyleToBackend(editedStyle),
      });
      
      // Update local context
      await saveUser({ 
        name: editedName.trim() || user?.name || '', 
        style: editedStyle,
        voiceRecordingUri: user?.voiceRecordingUrl 
      });
      
      setIsEditingStyle(false);
      Alert.alert('Success', 'Style preference updated');
    } catch (error) {
      console.error('Update style error:', error);
      Alert.alert('Error', 'Failed to update style');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelStyle = () => {
    setEditedStyle(user?.preferredStyle ? mapStyleToApp(user.preferredStyle) : null);
    setIsEditingStyle(false);
  };

  const handleVoiceRecordingComplete = async (uri: string) => {
    if (!userId) {
      Alert.alert('Error', 'User not found');
      return;
    }

    setIsLoading(true);
    try {
      // Upload voice recording to Convex
      const storageId = await uploadFileToConvex(
        generateUploadUrl,
        uri,
        'audio/mp3'
      );

      // Update profile - this will create ElevenLabs voice clone
      await updateProfile({
        userId,
        voiceRecordingStorageId: storageId,
      });

      // Also set as selected voice (will be set after ElevenLabs creates it)
      // Note: This happens async, so we'll need to refresh user data

      setIsEditingVoice(false);
      Alert.alert(
        'Success', 
        'Voice recording uploaded! Your voice clone is being created. This may take a few moments.'
      );
    } catch (error) {
      console.error('Voice upload error:', error);
      Alert.alert('Error', 'Failed to upload voice recording');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectVoice = async (voiceId: string) => {
    if (!userId) {
      Alert.alert('Error', 'User not found');
      return;
    }

    setIsLoading(true);
    try {
      await updateSelectedVoice({
        userId,
        voiceId,
      });

      setIsSelectingVoice(false);
      Alert.alert('Success', 'Voice selected successfully');
    } catch (error) {
      console.error('Select voice error:', error);
      Alert.alert('Error', 'Failed to select voice');
    } finally {
      setIsLoading(false);
    }
  };

  const playVoicePreview = (storageId: string, voiceId: string) => {
    // Stop current preview if playing
    if (sound) {
      sound.unloadAsync().catch(console.error);
      setSound(null);
    }

    if (playingPreviewId === voiceId) {
      // Stop if already playing this one
      setPlayingPreviewId(null);
      setPreviewStorageId(null);
      return;
    }

    // Set preview storage ID to trigger useQuery
    setPreviewStorageId(storageId);
    setPlayingPreviewId(voiceId);
  };


  const getCurrentVoiceName = () => {
    if (!user?.selectedVoiceId) return 'Not selected';
    
    // Check if it's a default voice
    const defaultVoice = defaultVoices?.find((v: any) => v.voiceId === user.selectedVoiceId);
    if (defaultVoice) return defaultVoice.name;
    
    // Check if it's custom voice
    if (user.elevenlabsVoiceId === user.selectedVoiceId) {
      return user.name ? `${user.name}'s Voice` : 'Your Voice';
    }
    
    return 'Custom Voice';
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearData();
              router.replace('/auth');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  if (!userId) {
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
        <View style={styles.modalContainer}>
          <View style={[styles.header, { paddingTop: 12 }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={closeModal}
              activeOpacity={0.7}
            >
              <X size={24} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Settings</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Please log in to access settings</Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (!user) {
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
        <View style={styles.modalContainer}>
          <View style={[styles.header, { paddingTop: 12 }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={closeModal}
              activeOpacity={0.7}
            >
              <X size={24} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Settings</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.orange} />
          </View>
        </View>
      </Animated.View>
    );
  }

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

          <View style={[styles.header, { paddingTop: 12 }]}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={closeModal}
              activeOpacity={0.7}
            >
              <X size={24} color={Colors.white} strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Settings</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>
          
          {/* Name Card */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.iconContainer}>
                <User size={20} color={Colors.orange} strokeWidth={2} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>Name</Text>
                {isEditingName ? (
                  <TextInput
                    style={styles.input}
                    value={editedName}
                    onChangeText={setEditedName}
                    placeholder="Enter your name"
                    placeholderTextColor={Colors.grayLight}
                    autoCapitalize="words"
                    autoFocus
                    editable={!isLoading}
                  />
                ) : (
                  <Text style={styles.cardValue}>{user.name || 'Not set'}</Text>
                )}
              </View>
              <View style={styles.actionButtons}>
                {isEditingName ? (
                  <>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleSaveName}
                      activeOpacity={0.7}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={Colors.orange} />
                      ) : (
                        <Check size={20} color={Colors.orange} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleCancelName}
                      activeOpacity={0.7}
                      disabled={isLoading}
                    >
                      <X size={20} color={Colors.grayLight} strokeWidth={2} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setIsEditingName(true)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={18} color={Colors.orange} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Style Card */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.iconContainer}>
                <Palette size={20} color={Colors.orange} strokeWidth={2} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>Style Preference</Text>
                {isEditingStyle ? (
                  <View style={styles.styleOptions}>
                    {STYLE_OPTIONS.map((style) => (
                      <TouchableOpacity
                        key={style}
                        style={[
                          styles.styleOption,
                          editedStyle === style && styles.styleOptionSelected,
                        ]}
                        onPress={() => setEditedStyle(style)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.styleOptionText,
                            editedStyle === style && styles.styleOptionTextSelected,
                          ]}
                        >
                          {style}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.cardValue}>
                    {user.preferredStyle ? mapStyleToApp(user.preferredStyle) : 'Not set'}
                  </Text>
                )}
              </View>
              <View style={styles.actionButtons}>
                {isEditingStyle ? (
                  <>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleSaveStyle}
                      activeOpacity={0.7}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color={Colors.orange} />
                      ) : (
                        <Check size={20} color={Colors.orange} strokeWidth={2} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleCancelStyle}
                      activeOpacity={0.7}
                      disabled={isLoading}
                    >
                      <X size={20} color={Colors.grayLight} strokeWidth={2} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setIsEditingStyle(true)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={18} color={Colors.orange} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Voice Selection Card */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.iconContainer}>
                <Headphones size={20} color={Colors.orange} strokeWidth={2} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardLabel}>Voice</Text>
                <Text style={styles.cardValue}>{getCurrentVoiceName()}</Text>
                {user.elevenlabsVoiceId && (
                  <Text style={styles.cardSubtext}>Custom voice available</Text>
                )}
              </View>
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setIsSelectingVoice(true)}
                  activeOpacity={0.7}
                >
                  <Edit2 size={18} color={Colors.orange} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Voice Recording Card (Create Clone) */}
          <View style={styles.card}>
            {isEditingVoice ? (
              <View style={styles.voiceRecorderContainer}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconContainer}>
                    <Mic size={20} color={Colors.orange} strokeWidth={2} />
                  </View>
                  <View style={styles.headerContent}>
                    <Text style={styles.cardLabel}>Record Voice Clone</Text>
                    <Text style={styles.cardSubtext}>
                      Record a sample to create your AI voice clone
                    </Text>
                  </View>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => setIsEditingVoice(false)}
                      activeOpacity={0.7}
                      disabled={isLoading}
                    >
                      <X size={20} color={Colors.grayLight} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
                <VoiceRecorder
                  onRecordingComplete={handleVoiceRecordingComplete}
                  initialRecordingUri={user.voiceRecordingUrl}
                  showScript={true}
                />
              </View>
            ) : (
              <View style={styles.cardRow}>
                <View style={styles.iconContainer}>
                  <Mic size={20} color={Colors.orange} strokeWidth={2} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardLabel}>Voice Clone</Text>
                  <Text style={styles.cardValue}>
                    {user.elevenlabsVoiceId ? 'Created' : 'Not created'}
                  </Text>
                  <Text style={styles.cardSubtext}>
                    Record your voice to create an AI clone
                  </Text>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setIsEditingVoice(true)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={18} color={Colors.orange} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Account Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Actions</Text>
          
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={styles.logoutContent}>
              <View style={styles.logoutIconContainer}>
                <LogOut size={20} color={Colors.white} strokeWidth={2} />
              </View>
              <Text style={styles.logoutText}>Logout</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Voice Selection Modal */}
        {isSelectingVoice && (
          <View style={styles.voiceModalOverlay}>
            <View style={styles.voiceModalContent}>
              <View style={styles.voiceModalHeader}>
                <Text style={styles.voiceModalTitle}>Select Voice</Text>
                <TouchableOpacity
                  onPress={() => setIsSelectingVoice(false)}
                  activeOpacity={0.7}
                >
                  <X size={24} color={Colors.white} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.voicesList}>
                {/* Custom Voice Option */}
                {user.elevenlabsVoiceId && (
                  <TouchableOpacity
                    style={[
                      styles.voiceOption,
                      user.selectedVoiceId === user.elevenlabsVoiceId && styles.voiceOptionSelected,
                    ]}
                    onPress={() => handleSelectVoice(user.elevenlabsVoiceId)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.voiceOptionContent}>
                      <Headphones size={24} color={Colors.orange} strokeWidth={2} />
                      <View style={styles.voiceOptionText}>
                        <Text style={styles.voiceOptionName}>
                          {user.name ? `${user.name}'s Voice` : 'Your Voice'}
                        </Text>
                        <Text style={styles.voiceOptionDesc}>Custom AI voice clone</Text>
                      </View>
                    </View>
                    {user.selectedVoiceId === user.elevenlabsVoiceId && (
                      <Check size={20} color={Colors.orange} strokeWidth={3} />
                    )}
                  </TouchableOpacity>
                )}

                {/* Default Voices */}
                {defaultVoices?.map((voice: any) => (
                  <TouchableOpacity
                    key={voice._id}
                    style={[
                      styles.voiceOption,
                      user.selectedVoiceId === voice.voiceId && styles.voiceOptionSelected,
                    ]}
                    onPress={() => handleSelectVoice(voice.voiceId)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.voiceOptionContent}>
                      <Volume2 size={24} color={Colors.orange} strokeWidth={2} />
                      <View style={styles.voiceOptionText}>
                        <Text style={styles.voiceOptionName}>{voice.name}</Text>
                        <Text style={styles.voiceOptionDesc}>
                          {voice.description || 'Default voice'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.voiceOptionActions}>
                      {voice.previewStorageId && (
                        <TouchableOpacity
                          style={styles.previewButton}
                          onPress={() => playVoicePreview(voice.previewStorageId!, voice.voiceId)}
                          activeOpacity={0.7}
                          disabled={playingPreviewId === voice.voiceId && !previewUrl}
                        >
                          {playingPreviewId === voice.voiceId && !previewUrl ? (
                            <ActivityIndicator size="small" color={Colors.orange} />
                          ) : (
                            <Volume2 size={18} color={Colors.orange} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
                      )}
                      {user.selectedVoiceId === voice.voiceId && (
                        <Check size={20} color={Colors.orange} strokeWidth={3} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </ScrollView>
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
    backgroundColor: Colors.black,
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
    backgroundColor: Colors.gray,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  placeholder: {
    width: 40,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.grayLight,
    fontSize: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.grayDark,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 14,
    color: Colors.grayLight,
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 18,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
  cardSubtext: {
    fontSize: 12,
    color: Colors.grayLight,
    marginTop: 2,
  },
  input: {
    backgroundColor: Colors.gray,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 2,
    borderColor: Colors.orange,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  styleOptions: {
    gap: 8,
    marginTop: 8,
  },
  styleOption: {
    backgroundColor: Colors.gray,
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleOptionSelected: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  styleOptionText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.white,
    textAlign: 'center',
  },
  styleOptionTextSelected: {
    color: Colors.orange,
  },
  voiceRecorderContainer: {
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerContent: {
    flex: 1,
    marginLeft: 16,
  },
  voiceModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  voiceModalContent: {
    backgroundColor: Colors.grayDark,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: Colors.gray,
  },
  voiceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  voiceModalTitle: {
    fontSize: 24,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  voicesList: {
    maxHeight: 400,
  },
  voiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  voiceOptionSelected: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  voiceOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  voiceOptionText: {
    flex: 1,
  },
  voiceOptionName: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    marginBottom: 4,
  },
  voiceOptionDesc: {
    fontSize: 12,
    color: Colors.grayLight,
  },
  voiceOptionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.grayDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  logoutIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
  },
});
