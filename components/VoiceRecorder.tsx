import { Mic, Square, Play, Pause, RotateCcw, Check } from 'lucide-react-native';
import { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';

const SCRIPT_TEXT = `Morning rush? Meet your new ritual.
The new AromaBrew One brings the café to your kitchen — freshly ground beans, perfect temperature, and silky crema every single time.
Whether you crave a bold espresso or a smooth latte, it's ready in under a minute with just one touch.
Sleek, smart, and effortless — designed to fit your countertop and your lifestyle.
AromaBrew One. Wake up better.`;

interface VoiceRecorderProps {
  onRecordingComplete: (uri: string) => void;
  initialRecordingUri?: string;
  showScript?: boolean;
}

export default function VoiceRecorder({ 
  onRecordingComplete, 
  initialRecordingUri,
  showScript = true 
}: VoiceRecorderProps) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | undefined>(initialRecordingUri);
  const [isRecording, setIsRecording] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount only
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (recording) {
        recording.getStatusAsync().then((status) => {
          if (status.isRecording || status.canRecord) {
            recording.stopAndUnloadAsync().catch(console.error);
          }
        }).catch(console.error);
      }
      if (sound) {
        sound.unloadAsync().catch(console.error);
      }
    };
  }, []); // Empty deps - only run on unmount

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Please grant microphone permissions to record your voice.'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setDuration(0);

      // Update duration while recording
      durationIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      newRecording.setOnRecordingStatusUpdate((status) => {
        if (status.isDoneRecording && durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      });
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      
      // Clear the duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      const uri = recording.getURI();
      await recording.stopAndUnloadAsync();
      
      // Clear recording state after unloading
      setRecording(null);

      if (uri) {
        setRecordingUri(uri);
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to stop recording. Please try again.');
      setRecording(null); // Clear state even on error
    }
  };

  const playRecording = async () => {
    if (!recordingUri) return;

    try {
      if (sound && isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        return;
      }

      if (sound && !isPlaying) {
        await sound.playAsync();
        setIsPlaying(true);
        return;
      }

      // Set audio mode to play in silent mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recordingUri },
        { shouldPlay: true }
      );

      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (error) {
      console.error('Failed to play recording:', error);
      Alert.alert('Error', 'Failed to play recording. Please try again.');
    }
  };

  const resetRecording = () => {
    if (sound) {
      sound.unloadAsync().catch(console.error);
      setSound(null);
    }
    setRecordingUri(undefined);
    setIsPlaying(false);
    setDuration(0);
  };

  const confirmRecording = () => {
    if (recordingUri) {
      onRecordingComplete(recordingUri);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {showScript && (
        <View style={styles.scriptContainer}>
          <Text style={styles.scriptTitle}>Read this script:</Text>
          <View style={styles.scriptBox}>
            <Text style={styles.scriptText}>{SCRIPT_TEXT}</Text>
          </View>
        </View>
      )}

      <View style={styles.recorderContainer}>
        {!recordingUri ? (
          <>
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordingActive]}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={
                  isRecording
                    ? ['#DC2626', '#EF4444']
                    : [Colors.orange, Colors.orangeLight]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.recordButtonGradient}
              >
                {isRecording ? (
                  <Square size={26} color={Colors.white} fill={Colors.white} />
                ) : (
                  <Mic size={26} color={Colors.white} strokeWidth={2} />
                )}
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.instruction}>
              {isRecording
                ? `Recording... ${formatDuration(duration)}`
                : 'Tap to start recording'}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.playbackControls}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={playRecording}
                activeOpacity={0.7}
              >
                {isPlaying ? (
                  <Pause size={24} color={Colors.orange} strokeWidth={2} />
                ) : (
                  <Play size={24} color={Colors.orange} strokeWidth={2} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={resetRecording}
                activeOpacity={0.7}
              >
                <RotateCcw size={24} color={Colors.grayLight} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <Text style={styles.instruction}>
              {isPlaying ? 'Playing...' : 'Tap play to review or re-record'}
            </Text>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmRecording}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[Colors.orange, Colors.orangeLight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmButtonGradient}
              >
                <Check size={20} color={Colors.white} strokeWidth={3} />
                <Text style={styles.confirmButtonText}>Use This Recording</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  scriptContainer: {
    gap: 8,
  },
  scriptTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.white,
  },
  scriptBox: {
    backgroundColor: 'rgba(255, 107, 53, 0.05)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
  },
  scriptText: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.grayLight,
  },
  recorderContainer: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  recordingActive: {
    transform: [{ scale: 1.05 }],
  },
  recordButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instruction: {
    fontSize: 14,
    color: Colors.grayLight,
    textAlign: 'center',
    marginTop: 4,
  },
  playbackControls: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.gray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.grayLight,
  },
  confirmButton: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  confirmButtonGradient: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});

