import { useRouter } from 'expo-router';
import { ArrowRight, ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
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
  Image,
} from 'react-native';
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

  return (
    <View style={styles.container}>
      {step > 1 && (
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 20 }]}
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <ChevronLeft size={28} color={Colors.ink} strokeWidth={2} />
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
              <Image
                source={require('../assets/images/reel-icon.png')}
                style={styles.iconImage}
                resizeMode="contain"
              />
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
                    placeholderTextColor={Colors.gray400}
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
                  <View
                    style={[
                      styles.buttonInner,
                      { backgroundColor: isStep1Valid ? Colors.ember : Colors.creamDark }
                    ]}
                  >
                    <Text style={[styles.buttonText, !isStep1Valid && styles.buttonTextDisabled]}>Next</Text>
                    <ArrowRight size={20} color={isStep1Valid ? Colors.white : Colors.inkMuted} strokeWidth={2.5} />
                  </View>
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
                  <View
                    style={[
                      styles.buttonInner,
                      { backgroundColor: isStep2Valid ? Colors.ember : Colors.creamDark }
                    ]}
                  >
                    <Text style={[styles.buttonText, !isStep2Valid && styles.buttonTextDisabled]}>Next</Text>
                    <ArrowRight size={20} color={isStep2Valid ? Colors.white : Colors.inkMuted} strokeWidth={2.5} />
                  </View>
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
                    Don&apos;t want to record? No worries! You&apos;ll be able to choose from our default AI voices in the settings.
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
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
  },
  iconImage: {
    width: 88,
    height: 88,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.medium,
    color: Colors.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
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
    color: Colors.ink,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.ink,
    borderWidth: 2,
    borderColor: Colors.creamDark,
    letterSpacing: 0,
  },
  optionsContainer: {
    gap: 12,
  },
  option: {
    backgroundColor: Colors.creamMedium,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.creamDark,
  },
  optionSelected: {
    borderColor: Colors.ember,
    backgroundColor: 'rgba(243, 106, 63, 0.1)',
  },
  optionText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.ink,
    textAlign: 'center',
  },
  optionTextSelected: {
    color: Colors.ember,
  },
  button: {
    marginTop: 24,
    borderRadius: 100,
    overflow: 'hidden',
    height: 64,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonInner: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 100,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: Fonts.medium,
    color: Colors.white,
  },
  buttonTextDisabled: {
    color: Colors.inkMuted,
  },
  voiceNoteContainer: {
    backgroundColor: Colors.creamMedium,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.creamDark,
  },
  voiceNoteText: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
