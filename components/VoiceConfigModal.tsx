import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/typography';
import { useApp } from '@/contexts/AppContext';
import VoiceRecorder from './VoiceRecorder';

interface VoiceConfigModalProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export default function VoiceConfigModal({
  visible,
  onComplete,
  onSkip,
  onClose,
}: VoiceConfigModalProps) {
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const [isSaving, setIsSaving] = useState(false);

  // Convex hooks
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const updateProfile = useAction(api.users.updateProfile);

  // Helper function to upload voice recording to Convex storage
  const uploadVoiceRecording = async (uri: string): Promise<string | null> => {
    try {
      console.log('[VoiceConfigModal] Uploading voice recording...');
      
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
      console.log('[VoiceConfigModal] Voice recording uploaded:', storageId);
      return storageId;
    } catch (error) {
      console.error('[VoiceConfigModal] Error uploading voice recording:', error);
      return null;
    }
  };

  const handleVoiceRecordingComplete = async (uri: string) => {
    if (!userId) return;
    
    setIsSaving(true);
    try {
      console.log('[VoiceConfigModal] Saving voice recording...');
      
      // Upload voice recording to Convex
      const voiceStorageId = await uploadVoiceRecording(uri);
      
      if (!voiceStorageId) {
        Alert.alert('Error', 'Failed to upload voice recording. Please try again.');
        setIsSaving(false);
        return;
      }
      
      // Update user profile with voice recording
      // This will create the ElevenLabs voice clone on the backend
      await updateProfile({
        userId,
        voiceRecordingStorageId: voiceStorageId,
      });
      
      console.log('[VoiceConfigModal] Voice saved successfully!');
      setIsSaving(false);
      
      // Small delay to let the UI update before closing
      setTimeout(() => {
        onComplete();
      }, 100);
    } catch (error) {
      console.error('[VoiceConfigModal] Error saving voice:', error);
      Alert.alert('Error', 'Failed to save your voice. Please try again.');
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    if (isSaving) return;
    onSkip();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
            disabled={isSaving}
          >
            <X size={24} color={isSaving ? Colors.gray400 : Colors.ink} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerContent}>
            <View style={styles.iconContainer}>
              <Image
                source={require('../assets/images/reel-icon.png')}
                style={styles.iconImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.title}>Record Your Voice</Text>
            <Text style={styles.subtitle}>
              Create your personalized AI voice for all your reels
            </Text>
          </View>

          <View style={styles.content}>
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              showScript={true}
              disabled={isSaving}
            />
            
            <View style={styles.noteContainer}>
              <Text style={styles.noteText}>
                Don&apos;t want to record? No worries! You can use our default AI voices instead.
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              <Text style={[styles.skipButtonText, isSaving && styles.skipButtonTextDisabled]}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  closeButton: {
    padding: 8,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  headerContent: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconImage: {
    width: 72,
    height: 72,
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
  content: {
    flex: 1,
  },
  noteContainer: {
    backgroundColor: Colors.creamMedium,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.creamDark,
  },
  noteText: {
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
  skipButtonTextDisabled: {
    opacity: 0.5,
  },
});
