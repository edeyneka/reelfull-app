import { useRouter } from 'expo-router';
import { Sparkles, ArrowRight, ChevronLeft, Mic } from 'lucide-react-native';
import { useState, useRef, useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { StylePreference } from '@/types';
import VoiceRecorder from '@/components/VoiceRecorder';
import { Fonts } from '@/constants/typography';
import { ENABLE_STYLE_PREFERENCE, DEFAULT_STYLE } from '@/constants/config';

const STYLE_OPTIONS: StylePreference[] = ['Playful', 'Professional', 'Dreamy'];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { saveUser, userId } = useApp();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<StylePreference | null>(null);
  const [voiceRecordingUri, setVoiceRecordingUri] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  
  // Convex hooks
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const completeOnboardingAction = useAction(api.users.completeOnboarding);

  const handleNext = () => {
    if (step === 1 && name.trim()) {
      if (ENABLE_STYLE_PREFERENCE) {
        setStep(2);
      } else {
        // Skip style selection, go directly to voice recording
        setSelectedStyle(DEFAULT_STYLE as StylePreference);
        setStep(2); // This is now the voice step when style is disabled
      }
    } else if (ENABLE_STYLE_PREFERENCE && step === 2 && selectedStyle) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (ENABLE_STYLE_PREFERENCE) {
      if (step === 3) {
        setStep(2);
      } else if (step === 2) {
        setStep(1);
      }
    } else {
      // When style is disabled, step 2 is voice recording
      if (step === 2) {
        setStep(1);
      }
    }
  };

  // Helper function to map local style to backend style
  const mapStyleToBackend = (style: StylePreference): 'playful' | 'professional' | 'travel' => {
    if (style === 'Playful') return 'playful';
    if (style === 'Professional') return 'professional';
    if (style === 'Dreamy') return 'travel';
    return 'playful'; // default
  };

  // Helper function to upload voice recording to Convex storage
  const uploadVoiceRecording = async (uri: string): Promise<string | null> => {
    try {
      console.log('[onboarding] Uploading voice recording...');
      
      // Get upload URL
      const uploadUrl = await generateUploadUrl();
      
      // Read the file
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Upload to Convex storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload voice recording');
      }
      
      const { storageId } = await uploadResponse.json();
      console.log('[onboarding] Voice recording uploaded:', storageId);
      return storageId;
    } catch (error) {
      console.error('[onboarding] Error uploading voice recording:', error);
      return null;
    }
  };

  const handleVoiceRecordingComplete = async (uri: string) => {
    if (!userId || !selectedStyle) return;
    
    setIsSaving(true);
    try {
      console.log('[onboarding] Completing onboarding with voice...');
      
      // Upload voice recording to Convex
      const voiceStorageId = await uploadVoiceRecording(uri);
      
      // Save to backend
      await completeOnboardingAction({
        userId,
        name: name.trim(),
        preferredStyle: mapStyleToBackend(selectedStyle),
        voiceRecordingStorageId: voiceStorageId || undefined,
      });
      
      // Also save locally (will be synced from backend on next load)
      await saveUser({ 
        name: name.trim(), 
        style: selectedStyle, 
        voiceRecordingUri: uri 
      });
      
      console.log('[onboarding] Onboarding complete!');
      router.replace('/(tabs)');
    } catch (error) {
      console.error('[onboarding] Error completing onboarding:', error);
      Alert.alert('Error', 'Failed to save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkipVoice = async () => {
    if (!userId || !selectedStyle) return;
    
    setIsSaving(true);
    try {
      console.log('[onboarding] Completing onboarding without voice...');
      
      // Save to backend
      await completeOnboardingAction({
        userId,
        name: name.trim(),
        preferredStyle: mapStyleToBackend(selectedStyle),
      });
      
      // Also save locally (will be synced from backend on next load)
      await saveUser({ name: name.trim(), style: selectedStyle });
      
      console.log('[onboarding] Onboarding complete!');
      router.replace('/(tabs)');
    } catch (error) {
      console.error('[onboarding] Error completing onboarding:', error);
      Alert.alert('Error', 'Failed to save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const isStep1Valid = name.trim().length > 0;
  const isStep2Valid = selectedStyle !== null;
  
  // Determine if current step is the voice recording step
  const isVoiceStep = ENABLE_STYLE_PREFERENCE ? step === 3 : step === 2;
  // Determine if current step is the style selection step (only when enabled)
  const isStyleStep = ENABLE_STYLE_PREFERENCE && step === 2;
  
  const videoSource = require('../assets/third_intro_ultra.mp4');
  
  // Crossfade video loop logic
  const video1Ref = useRef<Video>(null);
  const video2Ref = useRef<Video>(null);
  const video1Opacity = useRef(new Animated.Value(1)).current;
  const video2Opacity = useRef(new Animated.Value(0)).current;
  const activeVideo = useRef<1 | 2>(1);
  const isTransitioning = useRef(false);
  
  const FADE_DURATION = 800; // ms for crossfade
  const TRIGGER_BEFORE_END = 1000; // ms before end to start transition
  
  const handleVideo1Status = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    const duration = status.durationMillis || 0;
    const position = status.positionMillis || 0;
    const timeLeft = duration - position;
    
    // Start crossfade when approaching end
    if (activeVideo.current === 1 && timeLeft < TRIGGER_BEFORE_END && timeLeft > 0 && !isTransitioning.current) {
      isTransitioning.current = true;
      
      // Start video 2 and crossfade
      video2Ref.current?.setPositionAsync(0);
      video2Ref.current?.playAsync();
      
      Animated.parallel([
        Animated.timing(video1Opacity, {
          toValue: 0,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(video2Opacity, {
          toValue: 1,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        activeVideo.current = 2;
        isTransitioning.current = false;
        video1Ref.current?.pauseAsync();
      });
    }
  }, [video1Opacity, video2Opacity]);
  
  const handleVideo2Status = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    const duration = status.durationMillis || 0;
    const position = status.positionMillis || 0;
    const timeLeft = duration - position;
    
    // Start crossfade when approaching end
    if (activeVideo.current === 2 && timeLeft < TRIGGER_BEFORE_END && timeLeft > 0 && !isTransitioning.current) {
      isTransitioning.current = true;
      
      // Start video 1 and crossfade
      video1Ref.current?.setPositionAsync(0);
      video1Ref.current?.playAsync();
      
      Animated.parallel([
        Animated.timing(video2Opacity, {
          toValue: 0,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(video1Opacity, {
          toValue: 1,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        activeVideo.current = 1;
        isTransitioning.current = false;
        video2Ref.current?.pauseAsync();
      });
    }
  }, [video1Opacity, video2Opacity]);

  return (
    <View style={styles.container}>
      {/* Video Background with Crossfade */}
      <Animated.View style={[styles.videoContainer, { opacity: video1Opacity }]}>
        <Video
          ref={video1Ref}
          source={videoSource}
          style={styles.videoBackground}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isMuted
          onPlaybackStatusUpdate={handleVideo1Status}
          progressUpdateIntervalMillis={100}
        />
      </Animated.View>
      <Animated.View style={[styles.videoContainer, { opacity: video2Opacity }]}>
        <Video
          ref={video2Ref}
          source={videoSource}
          style={styles.videoBackground}
          resizeMode={ResizeMode.COVER}
          isMuted
          onPlaybackStatusUpdate={handleVideo2Status}
          progressUpdateIntervalMillis={100}
        />
      </Animated.View>
      
      {/* Semi-transparent overlay */}
      <View style={styles.overlay} />
      
      {/* Content */}
      <View style={styles.contentContainer}>
        {step > 1 && (
          <TouchableOpacity
            style={[styles.backButton, { top: insets.top + 20 }]}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <ChevronLeft size={28} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                {isVoiceStep ? (
                  <Mic size={40} color={Colors.orange} strokeWidth={2} />
                ) : (
                  <Sparkles size={40} color={Colors.orange} strokeWidth={2} />
                )}
              </View>
              <Text style={styles.title}>
                {step === 1 ? 'Welcome to Reelful' : isStyleStep ? 'Your Style' : 'Record Your Voice'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 1
                  ? "Let's personalize your experience"
                  : isStyleStep
                  ? 'Choose the style that best fits you'
                  : 'This helps us create more personalized content'}
              </Text>
            </View>

            <View style={styles.form}>
              {step === 1 ? (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>What&apos;s your name?</Text>
                    <TextInput
                      testID="nameInput"
                      style={styles.input}
                      placeholder="Enter your name"
                      placeholderTextColor={Colors.grayLight}
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="words"
                      autoCorrect={false}
                    />
                  </View>

                  <TouchableOpacity
                    testID="nextButton"
                    style={[styles.button, !isStep1Valid && styles.buttonDisabled]}
                    onPress={handleNext}
                    disabled={!isStep1Valid}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={
                        isStep1Valid
                          ? [Colors.orange, Colors.orangeLight]
                          : [Colors.gray, Colors.grayLight]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>Next</Text>
                      <ArrowRight size={20} color={Colors.white} strokeWidth={2.5} />
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : isStyleStep ? (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Choose your style</Text>
                    <View style={styles.optionsContainer}>
                      {STYLE_OPTIONS.map((style) => (
                        <TouchableOpacity
                          key={style}
                          style={[
                            styles.option,
                            selectedStyle === style && styles.optionSelected,
                          ]}
                          onPress={() => setSelectedStyle(style)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.optionText,
                              selectedStyle === style && styles.optionTextSelected,
                            ]}
                          >
                            {style}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.button, !isStep2Valid && styles.buttonDisabled]}
                    onPress={handleNext}
                    disabled={!isStep2Valid}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={
                        isStep2Valid
                          ? [Colors.orange, Colors.orangeLight]
                          : [Colors.gray, Colors.grayLight]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={styles.buttonText}>Next</Text>
                      <ArrowRight size={20} color={Colors.white} strokeWidth={2.5} />
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <VoiceRecorder
                    onRecordingComplete={handleVoiceRecordingComplete}
                    showScript={true}
                    disabled={isSaving}
                  />
                  
                  <View style={styles.voiceNoteContainer}>
                    <Text style={styles.voiceNoteText}>
                      💡 Don&apos;t want to record? No worries! You&apos;ll be able to choose from our default AI voices in the settings.
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    testID="skipVoiceButton"
                    style={styles.skipButton}
                    onPress={handleSkipVoice}
                    activeOpacity={0.7}
                    disabled={isSaving}
                  >
                    <Text style={[styles.skipButtonText, isSaving && { opacity: 0.5 }]}>
                      {isSaving ? 'Saving...' : 'Skip for now'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  videoBackground: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  contentContainer: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconContainer: {
    marginBottom: 20,
    padding: 16,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
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
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 32,
  },
  label: {
    fontSize: 18,
    fontFamily: Fonts.regular,
    color: Colors.white,
    marginBottom: 12,
  },
  input: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    letterSpacing: 0,
  },
  optionsContainer: {
    gap: 12,
  },
  option: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  optionSelected: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
  },
  optionText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.white,
    textAlign: 'center',
  },
  optionTextSelected: {
    color: Colors.orange,
  },
  button: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonGradient: {
    flexDirection: 'row',
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: Fonts.title,
    color: Colors.white,
  },
  voiceNoteContainer: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  voiceNoteText: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.grayLight,
    textAlign: 'center',
    fontFamily: Fonts.regular,
  },
  skipButton: {
    marginTop: 20,
    padding: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    textDecorationLine: 'underline',
  },
});
