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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import CountrySelector from '@/components/CountrySelector';
import { Country, DEFAULT_COUNTRY } from '@/constants/countries';
import { Fonts } from '@/constants/typography';

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { saveUserId } = useApp();
  
  // Convex hooks - connected to real backend
  const sendOTP = useAction(api.phoneAuth.sendOTP);
  const verifyOTP = useMutation(api.users.verifyOTP);
  const verifyTwilioOTP = useAction(api.twilioVerify.verifyTwilioOTP);
  
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
      
      console.log('Sending OTP to:', formattedPhone);
      
      // Call real Convex backend
      const result = await sendOTP({ phone: formattedPhone });
      
      console.log('OTP result:', result);
      
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
    } catch (error) {
      console.error('Send OTP error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send code');
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
      
      console.log('Verifying OTP...');
      console.log('Using Twilio Verify:', useTwilioVerify);
      
      // Call the appropriate verification method
      let result;
      if (useTwilioVerify) {
        // Use Twilio Verify (production mode)
        console.log('Verifying with Twilio Verify...');
        result = await verifyTwilioOTP({ phone: formattedPhone, code });
      } else {
        // Use local database verification (development mode)
        console.log('Verifying with local database...');
        result = await verifyOTP({ phone: formattedPhone, code });
      }
      
      console.log('Verification result:', result);
      
      if (result.success) {
        // Save userId to context
        await saveUserId(result.userId);
        
        // Navigate based on onboarding status
        if (result.onboardingCompleted) {
          Alert.alert('Welcome Back!', 'Redirecting to your feed...');
          router.replace('/feed');
        } else {
          Alert.alert('Welcome!', "Let's set up your profile...");
          router.replace('/onboarding');
        }
      }
    } catch (error) {
      console.error('Verify OTP error:', error);
      Alert.alert('Error', 'Invalid code. Please try again.');
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

  const isPhoneValid = () => {
    const digits = phoneNumber.replace(/\D/g, '');
    const expectedLength = selectedCountry.phoneLength || 10;
    return digits.length >= expectedLength - 1 && digits.length <= expectedLength + 1;
  };
  
  const isCodeValid = /^\d{6}$/.test(code);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.black, Colors.grayDark]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View
            style={[
              styles.content,
              { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 },
            ]}
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
                        autoFocus
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
                      autoFocus
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
          </View>
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
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
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
    backgroundColor: Colors.gray,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
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
    backgroundColor: Colors.gray,
    borderRadius: 12,
    padding: 16,
    fontSize: 32,
    fontFamily: Fonts.title,
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 2,
    borderColor: 'transparent',
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
});

