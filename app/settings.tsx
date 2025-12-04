import { useRouter } from 'expo-router';
import { User, Palette, X, Mic, Volume2, Headphones, Info, ChevronRight, Crown } from 'lucide-react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Audio } from 'expo-av';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { usePaywall } from '@/contexts/PaywallContext';
import { StylePreference, BackendStyle } from '@/types';
import VoiceRecorder from '@/components/VoiceRecorder';
import { uploadFileToConvex, mapStyleToBackend, mapStyleToApp } from '@/lib/api-helpers';
import { Fonts } from '@/constants/typography';
import { ENABLE_STYLE_PREFERENCE } from '@/constants/config';

const STYLE_OPTIONS: StylePreference[] = ['Playful', 'Professional', 'Dreamy'];

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId, saveUser, clearData } = useApp();
  const { subscriptionState } = usePaywall();
  
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
  const [isAboutOpen, setIsAboutOpen] = useState(false);
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
      // Set audio mode to play in silent mode
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
      });

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
          <View style={styles.dragHandle} />
          <View style={styles.closeButtonContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeModal}
              activeOpacity={0.7}
            >
              <X size={24} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
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
          <View style={styles.dragHandle} />
          <View style={styles.closeButtonContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeModal}
              activeOpacity={0.7}
            >
              <X size={24} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
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

          {/* Close Button */}
          <View style={styles.closeButtonContainer}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={closeModal}
              activeOpacity={0.7}
            >
              <X size={24} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {/* Profile Section */}
            <View style={styles.profileSection}>
              <Text style={styles.profileName}>{user.name || 'User'}</Text>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Menu Items */}
            <View style={styles.menuSection}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/paywall')}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconContainer, styles.proIconContainer]}>
                    <Crown size={22} color={Colors.orange} strokeWidth={2} />
                  </View>
                  <View>
                    <Text style={styles.menuItemText}>Reelful Pro</Text>
                    <Text style={styles.menuItemSubtext}>
                      {subscriptionState.isPro ? 'Active' : 'Unlock premium features'}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={20} color={Colors.grayLight} strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsEditingName(true)}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconContainer}>
                    <User size={22} color={Colors.white} strokeWidth={2} />
                  </View>
                  <Text style={styles.menuItemText}>Account</Text>
                </View>
                <ChevronRight size={20} color={Colors.grayLight} strokeWidth={2} />
              </TouchableOpacity>

              {ENABLE_STYLE_PREFERENCE && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => setIsEditingStyle(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconContainer}>
                      <Palette size={22} color={Colors.white} strokeWidth={2} />
                    </View>
                    <Text style={styles.menuItemText}>Content Preferences</Text>
                  </View>
                  <ChevronRight size={20} color={Colors.grayLight} strokeWidth={2} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsSelectingVoice(true)}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconContainer}>
                    <Headphones size={22} color={Colors.white} strokeWidth={2} />
                  </View>
                  <Text style={styles.menuItemText}>Voice Settings</Text>
                </View>
                <ChevronRight size={20} color={Colors.grayLight} strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsEditingVoice(true)}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconContainer}>
                    <Mic size={22} color={Colors.white} strokeWidth={2} />
                  </View>
                  <Text style={styles.menuItemText}>Voice Clone</Text>
                </View>
                <ChevronRight size={20} color={Colors.grayLight} strokeWidth={2} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsAboutOpen(true)}
                activeOpacity={0.7}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.menuIconContainer}>
                    <Info size={22} color={Colors.white} strokeWidth={2} />
                  </View>
                  <Text style={styles.menuItemText}>About</Text>
                </View>
                <ChevronRight size={20} color={Colors.grayLight} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Edit Name Modal */}
          {isEditingName && (
            <View style={styles.editModalOverlay}>
              <View style={styles.editModalContent}>
                <View style={styles.editModalHeader}>
                  <Text style={styles.editModalTitle}>Edit Name</Text>
                  <TouchableOpacity
                    onPress={handleCancelName}
                    activeOpacity={0.7}
                    disabled={isLoading}
                  >
                    <X size={24} color={Colors.white} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.editInput}
                  value={editedName}
                  onChangeText={setEditedName}
                  placeholder="Enter your name"
                  placeholderTextColor={Colors.grayLight}
                  autoCapitalize="words"
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={handleSaveName}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={
                      !isLoading
                        ? [Colors.orange, Colors.orangeLight]
                        : [Colors.gray, Colors.grayLight]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.saveButton}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Edit Style Modal */}
          {ENABLE_STYLE_PREFERENCE && isEditingStyle && (
            <View style={styles.editModalOverlay}>
              <View style={styles.editModalContent}>
                <View style={styles.editModalHeader}>
                  <Text style={styles.editModalTitle}>Content Preferences</Text>
                  <TouchableOpacity
                    onPress={handleCancelStyle}
                    activeOpacity={0.7}
                    disabled={isLoading}
                  >
                    <X size={24} color={Colors.white} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
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
                <TouchableOpacity
                  onPress={handleSaveStyle}
                  activeOpacity={0.7}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={
                      !isLoading
                        ? [Colors.orange, Colors.orangeLight]
                        : [Colors.gray, Colors.grayLight]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.saveButton}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.saveButtonText}>Save</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Voice Recording Modal */}
          {isEditingVoice && (
            <View style={styles.editModalOverlay}>
              <View style={styles.voiceCloneModalContent}>
                <View style={styles.voiceModalHeader}>
                  <Text style={styles.editModalTitle}>Voice Clone</Text>
                  <TouchableOpacity
                    onPress={() => setIsEditingVoice(false)}
                    activeOpacity={0.7}
                    disabled={isLoading}
                  >
                    <X size={24} color={Colors.white} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalDescription}>
                  Record a sample to create your AI voice clone
                </Text>
                <VoiceRecorder
                  onRecordingComplete={handleVoiceRecordingComplete}
                  initialRecordingUri={user.voiceRecordingUrl}
                  showScript={true}
                  disabled={isLoading}
                />
              </View>
            </View>
          )}

          {/* Voice Selection Modal */}
          {isSelectingVoice && (
            <View style={styles.editModalOverlay}>
              <View style={styles.voiceModalContent}>
                <View style={styles.editModalHeader}>
                  <Text style={styles.editModalTitle}>Select Voice</Text>
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
                      {user.voicePreviewStorageId && (
                        <TouchableOpacity
                          style={styles.previewButton}
                          onPress={() => playVoicePreview(user.voicePreviewStorageId!, user.elevenlabsVoiceId)}
                          activeOpacity={0.7}
                          disabled={playingPreviewId === user.elevenlabsVoiceId && !previewUrl}
                        >
                          {playingPreviewId === user.elevenlabsVoiceId && !previewUrl ? (
                            <ActivityIndicator size="small" color={Colors.orange} />
                          ) : (
                            <Volume2 size={18} color={Colors.orange} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
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
                        <View style={styles.voiceOptionTextContainer}>
                          <Text style={styles.voiceOptionName}>{voice.name}</Text>
                          <Text style={styles.voiceOptionDesc}>
                            {voice.description || 'Default voice'}
                          </Text>
                        </View>
                      </View>
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
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          {/* About Modal */}
          {isAboutOpen && (
            <View style={styles.editModalOverlay}>
              <View style={styles.editModalContent}>
                <View style={styles.editModalHeader}>
                  <Text style={styles.editModalTitle}>About Reelful</Text>
                  <TouchableOpacity
                    onPress={() => setIsAboutOpen(false)}
                    activeOpacity={0.7}
                  >
                    <X size={24} color={Colors.white} strokeWidth={2} />
                  </TouchableOpacity>
                </View>
                <View style={styles.aboutContent}>
                  <Text style={styles.aboutDescription}>
                    Upload your photos and videos with a short description and get a ready-to-share clip in minutes.
                  </Text>
                  <Text style={styles.aboutDescription}>
                    Transform your memories into engaging content effortlessly.
                  </Text>
                  <View style={styles.madeWithLove}>
                    <Text style={styles.madeWithLoveText}>Made with love </Text>
                    <Text style={styles.orangeHeart}>🧡</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
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
  closeButtonContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingTop: 0,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
  },
  // Profile Section
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  profileName: {
    fontSize: 24,
    fontFamily: Fonts.regular,
    color: Colors.white,
    fontWeight: '600',
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginBottom: 8,
  },
  // Menu Section
  menuSection: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.white,
    fontFamily: Fonts.regular,
  },
  menuItemSubtext: {
    fontSize: 12,
    color: Colors.grayLight,
    fontFamily: Fonts.regular,
    marginTop: 2,
  },
  proIconContainer: {
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderRadius: 8,
  },
  // Logout
  logoutButton: {
    marginHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: 16,
    color: '#ff3b30',
    fontFamily: Fonts.regular,
  },
  // Edit Modals
  editModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  editModalContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  editModalTitle: {
    fontSize: 20,
    fontFamily: Fonts.title,
    color: Colors.white,
    fontWeight: '600',
  },
  editInput: {
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.white,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  saveButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    fontWeight: '600',
  },
  // Style Options
  styleOptions: {
    gap: 12,
    marginBottom: 24,
  },
  styleOption: {
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  styleOptionSelected: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  styleOptionText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    textAlign: 'center',
  },
  styleOptionTextSelected: {
    color: Colors.orange,
    fontWeight: '600',
  },
  // Voice Modal
  voiceModalContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    width: '92%',
    maxHeight: '92%',
  },
  voiceCloneModalContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    width: '92%',
  },
  voiceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: '#8e8e93',
    marginBottom: 12,
    textAlign: 'center',
  },
  voicesList: {
    maxHeight: 400,
  },
  voiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2c2c2e',
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
  voiceOptionTextContainer: {
    flex: 1,
  },
  voiceOptionName: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    marginBottom: 4,
  },
  voiceOptionDesc: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: '#8e8e93',
  },
  previewButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3a3a3c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // About Modal
  aboutContent: {
    paddingVertical: 8,
  },
  aboutDescription: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    lineHeight: 24,
    marginBottom: 16,
  },
  madeWithLove: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#3a3a3c',
  },
  madeWithLoveText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
  },
  orangeHeart: {
    fontSize: 18,
  },
});
