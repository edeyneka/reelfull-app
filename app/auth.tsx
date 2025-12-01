import { useRouter } from 'expo-router';
import { Phone, ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import CountrySelector from '@/components/CountrySelector';
import { Country, DEFAULT_COUNTRY } from '@/constants/countries';
import { Fonts } from '@/constants/typography';
import { Audio } from 'expo-av';
import { ENABLE_TEST_RUN_MODE } from '@/constants/config';

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed:`, error.message);
      
      // Don't retry on the last attempt
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`[Retry] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Request microphone permission after successful verification
async function requestMicrophonePermission(): Promise<boolean> {
  try {
    console.log('[Auth] Requesting microphone permission...');
    const { status } = await Audio.requestPermissionsAsync();
    
    if (status === 'granted') {
      console.log('[Auth] Microphone permission granted');
      return true;
    } else {
      console.log('[Auth] Microphone permission denied:', status);
      // Don't block the flow if permission is denied
      Alert.alert(
        'Microphone Access',
        'Microphone access is needed to record voice samples for personalized content. You can enable it later in Settings.',
        [{ text: 'OK' }]
      );
      return false;
    }
  } catch (error) {
    console.error('[Auth] Error requesting microphone permission:', error);
    // Don't block the flow on error
    return false;
  }
}

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { saveUserId } = useApp();
  
  // Convex hooks - connected to real backend
  const sendOTP = useAction(api.phoneAuth.sendOTP);
  const verifyOTP = useMutation(api.users.verifyOTP);
  const verifyTwilioOTP = useAction(api.twilioVerify.verifyTwilioOTP);
  const testAccountLogin = useMutation(api.users.testAccountLogin);
  
  // Track if we're using Twilio Verify or development mode
  const [useTwilioVerify, setUseTwilioVerify] = useState(false);
  
  // State
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const formatPhoneNumber = (value: string, country: Country) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // For US/Canada, format as (XXX) XXX-XXXX
    if (country.code === 'US' || country.code === 'CA') {
      if (digits.length <= 3) {
        return digits;
      } else if (digits.length <= 6) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      } else {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
      }
    }
    
    // For other countries, just return digits with spaces every 3-4 digits
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    } else {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
  };

  const handleSendCode = async () => {
    // Validate phone number
    const digits = phoneNumber.replace(/\D/g, '');
    const expectedLength = selectedCountry.phoneLength || 10;
    
    if (digits.length < expectedLength - 1 || digits.length > expectedLength + 1) {
      Alert.alert('Invalid Phone', `Please enter a valid phone number for ${selectedCountry.name}`);
      return;
    }

    setIsLoading(true);

    try {
      // Format as E.164 for backend
      const formattedPhone = `${selectedCountry.dialCode}${digits}`;
      
      console.log('[Auth] Sending OTP to:', formattedPhone);
      
      // Call Convex backend with retry logic
      const result = await retryWithBackoff(
        async () => {
          console.log('[Auth] Attempting to send OTP...');
          return await sendOTP({ phone: formattedPhone });
        },
        3, // 3 retries
        1000 // 1 second initial delay
      );
      
      console.log('[Auth] OTP result:', result);
      
      if (result.success) {
        // Remember if we're using Twilio Verify
        setUseTwilioVerify(result.useTwilioVerify || false);
        
        // Show message based on environment
        if (result.useTwilioVerify) {
          Alert.alert('Code Sent', 'Check your phone for the verification code');
        } else {
          Alert.alert(
            'Development Mode',
            'Check the backend console for your OTP code (not sent via SMS)'
          );
        }
        setStep('code');
      } else {
        Alert.alert('Error', result.error || 'Failed to send code');
      }
    } catch (error: any) {
      console.error('[Auth] Send OTP error:', error);
      
      // Provide more helpful error message for connection issues
      const errorMessage = error?.message || 'Failed to send code';
      const isConnectionError = errorMessage.includes('Connection lost') || 
                               errorMessage.includes('network') ||
                               errorMessage.includes('timeout');
      
      if (isConnectionError) {
        Alert.alert(
          'Connection Error',
          'Could not connect to the server. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    // Validate code
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      Alert.alert('Invalid Code', 'Please enter a valid 6-digit code');
      return;
    }

    setIsLoading(true);

    try {
      const digits = phoneNumber.replace(/\D/g, '');
      const formattedPhone = `${selectedCountry.dialCode}${digits}`;
      
      console.log('[Auth] Verifying OTP...');
      console.log('[Auth] Using Twilio Verify:', useTwilioVerify);
      
      // Call the appropriate verification method with retry logic
      const result = await retryWithBackoff(
        async () => {
          if (useTwilioVerify) {
            // Use Twilio Verify (production mode)
            console.log('[Auth] Verifying with Twilio Verify...');
            return await verifyTwilioOTP({ phone: formattedPhone, code });
          } else {
            // Use local database verification (development mode)
            console.log('[Auth] Verifying with local database...');
            return await verifyOTP({ phone: formattedPhone, code });
          }
        },
        3,
        1000
      );
      
      console.log('[Auth] Verification result:', result);
      
      if (result.success) {
        // Save userId to context
        await saveUserId(result.userId);
        
        // Request microphone permission after successful verification
        await requestMicrophonePermission();
        
        // Navigate based on onboarding status (or test mode)
        if (ENABLE_TEST_RUN_MODE) {
          // Test mode: always go to onboarding for testing
          Alert.alert('Test Mode', 'Redirecting to onboarding for testing...');
          router.replace('/onboarding');
        } else if (result.onboardingCompleted) {
          Alert.alert('Welcome Back!', 'Redirecting to your feed...');
          router.replace('/feed');
        } else {
          Alert.alert('Welcome!', "Let's set up your profile...");
          router.replace('/onboarding');
        }
      }
    } catch (error: any) {
      console.error('[Auth] Verify OTP error:', error);
      
      const errorMessage = error?.message || 'Invalid code';
      const isConnectionError = errorMessage.includes('Connection lost') || 
                               errorMessage.includes('network') ||
                               errorMessage.includes('timeout');
      
      if (isConnectionError) {
        Alert.alert(
          'Connection Error',
          'Could not connect to the server. Please check your internet connection and try again.'
        );
      } else {
        Alert.alert('Error', 'Invalid code. Please try again.');
      }
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePhone = () => {
    setStep('phone');
    setCode('');
    setUseTwilioVerify(false); // Reset when changing phone
  };

  const handleTestAccount = async () => {
    setIsLoading(true);
    try {
      const testPhone = '+14244131728';
      console.log('[Test Account] Accessing test account:', testPhone);
      
      // Use the dedicated test account login mutation
      const result = await testAccountLogin({ phone: testPhone });
      
      if (result.success && result.userId) {
        console.log('[Test Account] Success! User ID:', result.userId);
        
        // Save userId to context
        await saveUserId(result.userId);
        
        // Request microphone permission after successful verification
        await requestMicrophonePermission();
        
        // Navigate based on onboarding status (or test mode)
        if (ENABLE_TEST_RUN_MODE) {
          // Test mode: always go to onboarding for testing
          router.replace('/onboarding');
        } else if (result.onboardingCompleted) {
          router.replace('/feed');
        } else {
          router.replace('/onboarding');
        }
      } else {
        Alert.alert('Error', 'Failed to access test account.');
      }
    } catch (error) {
      console.error('[Test Account] Error:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to access test account. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isPhoneValid = () => {
    const digits = phoneNumber.replace(/\D/g, '');
    const expectedLength = selectedCountry.phoneLength || 10;
    return digits.length >= expectedLength - 1 && digits.length <= expectedLength + 1;
  };
  
  const isCodeValid = /^\d{6}$/.test(code);
  
  const videoSource = require('../assets/third_intro_ultra.mp4');

  return (
    <View style={styles.container}>
      {/* Video Background */}
      <Video
        source={videoSource}
        style={styles.videoBackground}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />
      
      {/* Semi-transparent overlay */}
      <View style={styles.overlay} />
      
      {/* Content */}
      <View style={styles.contentContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 },
            ]}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Phone size={40} color={Colors.orange} strokeWidth={2} />
              </View>
              <Text style={styles.title}>
                {step === 'phone' ? 'Welcome to Reelful' : 'Enter Verification Code'}
              </Text>
              <Text style={styles.subtitle}>
                {step === 'phone'
                  ? 'Enter your phone number to continue'
                  : `We sent a code to ${selectedCountry.dialCode} ${formatPhoneNumber(phoneNumber, selectedCountry)}`}
              </Text>
            </View>

            <View style={styles.form}>
              {step === 'phone' ? (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Phone Number</Text>
                    <View style={styles.phoneInputContainer}>
                      <CountrySelector
                        selectedCountry={selectedCountry}
                        onSelectCountry={setSelectedCountry}
                      />
                      <View style={styles.divider} />
                      <TextInput
                        style={styles.phoneInput}
                        placeholder={selectedCountry.code === 'US' || selectedCountry.code === 'CA' 
                          ? '(555) 123-4567' 
                          : 'Phone number'}
                        placeholderTextColor={Colors.grayLight}
                        value={phoneNumber}
                        onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text, selectedCountry))}
                        keyboardType="phone-pad"
                        maxLength={20}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.button, !isPhoneValid() && styles.buttonDisabled]}
                    onPress={handleSendCode}
                    disabled={!isPhoneValid() || isLoading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={
                        isPhoneValid() && !isLoading
                          ? [Colors.orange, Colors.orangeLight]
                          : [Colors.gray, Colors.grayLight]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={Colors.white} />
                      ) : (
                        <>
                          <Text style={styles.buttonText}>Send Code</Text>
                          <ArrowRight size={20} color={Colors.white} strokeWidth={2.5} />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Test Account Button - Commented out for production */}
                  {/* <TouchableOpacity
                    style={styles.testAccountButton}
                    onPress={handleTestAccount}
                    disabled={isLoading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.testAccountText}>Use Test Account</Text>
                  </TouchableOpacity> */}
                </>
              ) : (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Verification Code</Text>
                    <TextInput
                      style={styles.codeInput}
                      placeholder="000000"
                      placeholderTextColor={Colors.grayLight}
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.button, !isCodeValid && styles.buttonDisabled]}
                    onPress={handleVerifyCode}
                    disabled={!isCodeValid || isLoading}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={
                        isCodeValid && !isLoading
                          ? [Colors.orange, Colors.orangeLight]
                          : [Colors.gray, Colors.grayLight]
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={Colors.white} />
                      ) : (
                        <>
                          <Text style={styles.buttonText}>Verify</Text>
                          <ArrowRight size={20} color={Colors.white} strokeWidth={2.5} />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.changePhoneButton}
                    onPress={handleChangePhone}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.changePhoneText}>Change phone number</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.resendButton}
                    onPress={handleSendCode}
                    disabled={isLoading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resendText}>Resend code</Text>
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
  videoBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  keyboardView: {
    flex: 1,
  },
  content: {
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
    fontFamily: Fonts.regular,
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
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.grayLight,
    opacity: 0.3,
  },
  phoneInput: {
    flex: 1,
    padding: 16,
    fontSize: 18,
    color: Colors.white,
  },
  codeInput: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 12,
    padding: 16,
    fontSize: 32,
    fontFamily: Fonts.title,
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
  changePhoneButton: {
    marginTop: 24,
    padding: 16,
    alignItems: 'center',
  },
  changePhoneText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.orange,
  },
  resendButton: {
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    textDecorationLine: 'underline',
  },
  testAccountButton: {
    marginTop: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.grayLight,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  testAccountText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
  },
});

