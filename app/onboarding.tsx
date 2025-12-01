import { useRouter } from 'expo-router';
import { Sparkles, ArrowRight, ChevronLeft } from 'lucide-react-native';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { StylePreference } from '@/types';
import VoiceRecorder from '@/components/VoiceRecorder';
import { Fonts } from '@/constants/typography';

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
      setStep(2);
    } else if (step === 2 && selectedStyle) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
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
      router.replace('/feed');
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
      router.replace('/feed');
    } catch (error) {
      console.error('[onboarding] Error completing onboarding:', error);
      Alert.alert('Error', 'Failed to save your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const isStep1Valid = name.trim().length > 0;
  const isStep2Valid = selectedStyle !== null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.black, Colors.grayDark]}
        style={styles.gradient}
      >
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
                <Sparkles size={40} color={Colors.orange} strokeWidth={2} />
              </View>
              <Text style={styles.title}>
                {step === 1 ? 'Welcome to Reelful' : step === 2 ? 'Your Style' : 'Record Your Voice'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 1
                  ? "Let's personalize your experience"
                  : step === 2
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
              ) : step === 2 ? (
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
                  />
                  
                  <TouchableOpacity
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
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  gradient: {
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
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
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
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionsContainer: {
    gap: 12,
  },
  option: {
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
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
