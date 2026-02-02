import { useRouter } from 'expo-router';
import { useCallback, useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Sparkles, Zap, Crown, Ticket, Check, Gift } from 'lucide-react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/typography';
import { usePaywall, CREDIT_PACKS, CreditPackType } from '@/contexts/PaywallContext';
import { useApp } from '@/contexts/AppContext';
import * as Haptics from 'expo-haptics';

type PlanType = 'monthly' | 'annual';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COUNT = 150;
const CONFETTI_COLORS = ['#F36A3F', '#F58560', '#E05530', '#FAF9F5', '#D4A574', '#C9B8A8', '#E0C4B0'];

// Confetti particle component
function ConfettiParticle({ delay, startX }: { delay: number; startX: number }) {
  const translateY = useRef(new Animated.Value(-20)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  
  const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  const size = 6 + Math.random() * 12;
  const horizontalDrift = (Math.random() - 0.5) * 120;
  
  useEffect(() => {
    // Faster fall: 1.5-2.5 seconds
    const duration = 1500 + Math.random() * 1000;
    
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT + 50,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: horizontalDrift,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 360 * (2 + Math.random() * 3),
          duration,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, translateY, translateX, rotate, horizontalDrift]);
  
  const rotateInterpolate = rotate.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });
  
  return (
    <Animated.View
      style={[
        styles.confettiParticle,
        {
          left: startX,
          width: size,
          height: size * 0.6,
          backgroundColor: color,
          transform: [
            { translateY },
            { translateX },
            { rotate: rotateInterpolate },
          ],
        },
      ]}
    />
  );
}

// Confetti container component
function Confetti({ show }: { show: boolean }) {
  if (!show) return null;
  
  const particles = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    delay: Math.random() * 800,
    startX: Math.random() * SCREEN_WIDTH,
  }));
  
  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {particles.map((particle) => (
        <ConfettiParticle
          key={particle.id}
          delay={particle.delay}
          startX={particle.startX}
        />
      ))}
    </View>
  );
}

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useApp();
  const {
    monthlyPackage,
    annualPackage,
    purchasePackage,
    restorePurchases,
    isLoading,
    subscriptionState,
    markPaywallCompleted,
    purchaseCredits,
    getCreditPackPrice,
  } = usePaywall();
  
  // Mutation to sync subscription status to backend
  const updateSubscriptionStatus = useMutation(api.users.updateSubscriptionStatus);
  
  // Query video generation status to check if user has reached free tier limit
  const videoGenerationStatus = useQuery(
    api.users.getVideoGenerationStatus,
    userId ? { userId } : "skip"
  );
  
  // Check if limit is reached (for display purposes only - user can always dismiss)
  const hasReachedLimit = videoGenerationStatus?.hasReachedLimit ?? false;
  
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedCreditPack, setSelectedCreditPack] = useState<CreditPackType>('PACK_10');
  const [isPurchasingCredits, setIsPurchasingCredits] = useState(false);
  
  // Pro users see credits view, non-Pro users see subscription view
  // Use backend status (more reliable) with fallback to RevenueCat status
  const showCreditsView = videoGenerationStatus?.isPremium ?? subscriptionState.isPro;
  
  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  // Promo code mutation
  const redeemPromoCode = useMutation(api.users.redeemPromoCode);

  // Track keyboard visibility to adjust bottom padding
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);
  
  // ScrollView ref for auto-scrolling
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Animations
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Animate in on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropAnim, contentAnim, slideAnim]);

  const fadeOutAndClose = useCallback((delay: number = 0) => {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(contentAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        router.back();
      });
    }, delay);
  }, [backdropAnim, contentAnim, router]);

  // Navigate after successful subscription/restore
  // Uses back() to return to the previous screen (settings or feed)
  const navigateAfterSuccess = useCallback((delay: number = 0) => {
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(contentAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Go back to previous screen (settings if opened from there, feed otherwise)
        router.back();
      });
    }, delay);
  }, [backdropAnim, contentAnim, router]);

  const handleClose = useCallback(() => {
    // Always allow dismissing - user can go back to gallery to view previous projects
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fadeOutAndClose(0);
  }, [fadeOutAndClose]);

  const handleSelectPlan = useCallback((plan: PlanType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(plan);
  }, []);

  const handleSubscribe = useCallback(async () => {
    // Hide keyboard and scroll back to top
    Keyboard.dismiss();
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    
    const pkg = selectedPlan === 'monthly' ? monthlyPackage : annualPackage;
    
    if (!pkg) {
      console.log('[Paywall] No package available for selected plan');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);
    
    try {
      const success = await purchasePackage(pkg);
      if (success) {
        // Mark paywall as completed for this session (for test mode)
        markPaywallCompleted();
        
        // Sync subscription status to backend with subscription type
        if (userId) {
          try {
            await updateSubscriptionStatus({
              userId,
              isPremium: true,
              subscriptionExpiresAt: subscriptionState.expirationDate || undefined,
              subscriptionType: selectedPlan === 'monthly' ? 'monthly' : 'annual',
            });
            console.log('[Paywall] Subscription status synced to backend');
          } catch (syncError) {
            console.error('[Paywall] Failed to sync subscription status:', syncError);
            // Continue anyway - purchase was successful
          }
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowConfetti(true);
        // Wait for all confetti to fall, then dismiss all modals
        navigateAfterSuccess(2500);
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [selectedPlan, monthlyPackage, annualPackage, purchasePackage, navigateAfterSuccess, userId, updateSubscriptionStatus, subscriptionState, markPaywallCompleted]);

  const handleRestore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    
    try {
      const success = await restorePurchases();
      if (success) {
        // Mark paywall as completed for this session (for test mode)
        markPaywallCompleted();
        
        // Sync subscription status to backend
        if (userId) {
          try {
            await updateSubscriptionStatus({
              userId,
              isPremium: true,
              subscriptionExpiresAt: subscriptionState.expirationDate || undefined,
            });
            console.log('[Paywall] Subscription status synced to backend after restore');
          } catch (syncError) {
            console.error('[Paywall] Failed to sync subscription status:', syncError);
            // Continue anyway - restore was successful
          }
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowConfetti(true);
        // Wait for all confetti to fall, then dismiss all modals
        navigateAfterSuccess(2500);
      }
    } finally {
      setIsRestoring(false);
    }
  }, [restorePurchases, navigateAfterSuccess, userId, updateSubscriptionStatus, subscriptionState, markPaywallCompleted]);

  const handleApplyPromoCode = useCallback(async () => {
    if (!promoCode.trim()) {
      setPromoError('Please enter a promo code');
      return;
    }
    
    if (!userId) {
      setPromoError('Please sign in first');
      return;
    }
    
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsApplyingPromo(true);
    setPromoError(null);
    setPromoSuccess(null);
    
    try {
      const result = await redeemPromoCode({
        userId,
        code: promoCode.trim(),
      });
      
      if (result.success) {
        // Mark paywall as completed for this session (for test mode)
        markPaywallCompleted();
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPromoSuccess(`🎉 Premium activated for ${result.durationDays} days!`);
        setShowConfetti(true);
        // Wait for confetti, then close
        navigateAfterSuccess(2500);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPromoError(result.error || 'Failed to apply promo code');
      }
    } catch (err) {
      console.error('[Paywall] Error applying promo code:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPromoError('Failed to apply promo code');
    } finally {
      setIsApplyingPromo(false);
    }
  }, [promoCode, userId, redeemPromoCode, navigateAfterSuccess, markPaywallCompleted]);

  const handlePurchaseCredits = useCallback(async () => {
    Keyboard.dismiss();
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasingCredits(true);
    
    try {
      const success = await purchaseCredits(selectedCreditPack);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowConfetti(true);
        navigateAfterSuccess(2500);
      }
    } finally {
      setIsPurchasingCredits(false);
    }
  }, [selectedCreditPack, purchaseCredits, navigateAfterSuccess]);

  const monthlyPrice = monthlyPackage?.product?.priceString || '$9.99';
  const annualPrice = annualPackage?.product?.priceString || '$79.99';
  const annualMonthlyPrice = annualPackage?.product?.price 
    ? `$${(annualPackage.product.price / 12).toFixed(2)}`
    : '$3.33';

  const features = [
    { icon: Zap, text: '10 videos per month or 150 videos per year' },
    { icon: Sparkles, text: 'Buy more credits anytime' },
  ];

  if (isLoading) {
    return (
      <View style={styles.modalWrapper}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Colors.ember} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.modalWrapper}>
      {/* Backdrop */}
      <Animated.View 
        style={[
          styles.backdrop, 
          { opacity: backdropAnim }
        ]} 
      />
      
      {/* Content */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View 
          style={[
            styles.container, 
            { 
              paddingTop: insets.top, 
              paddingBottom: isKeyboardVisible ? 0 : insets.bottom,
              opacity: contentAnim,
              transform: [{ translateY: slideAnim }],
            }
          ]}
        >
          {/* Close button - always shown so user can go back to gallery */}
          <TouchableOpacity
            style={[styles.closeButton, { top: insets.top + 12 }]}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <X size={24} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              isKeyboardVisible && { paddingBottom: 0 }
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Hero Section */}
            <View style={showCreditsView ? styles.heroSectionCompact : styles.heroSection}>
          <View style={showCreditsView ? styles.iconContainerCompact : styles.iconContainer}>
            {showCreditsView ? <Gift size={30} color={Colors.white} /> : <Crown size={30} color={Colors.white} />}
          </View>
          <Text style={showCreditsView ? styles.titleCompact : styles.title}>
            {showCreditsView ? 'Buy More Credits' : 'Unlock Reelful Pro'}
          </Text>
          <Text style={showCreditsView ? styles.subtitleCompact : styles.subtitle}>
            {showCreditsView 
              ? "Add extra video credits to your account. Credits never expire!"
              : hasReachedLimit 
                ? "You've used all 3 free videos. Subscribe to continue creating unlimited stunning videos!"
                : "Create stunning videos with AI"
            }
          </Text>
          
          {/* Show current credits for Pro users - inline version */}
          {showCreditsView && videoGenerationStatus && (
            <View style={styles.currentCreditsDisplayInline}>
              <Text style={styles.currentCreditsLabelInline}>Your Credits: </Text>
              <Text style={styles.currentCreditsValueInline}>
                {videoGenerationStatus.totalCreditsRemaining}
              </Text>
            </View>
          )}
        </View>

      {showCreditsView ? (
        <>
          {/* Credit Packs for Pro users */}
          <View style={styles.creditPacksSection}>
            <Text style={styles.creditPacksTitle}>Choose a Credit Pack</Text>
            
            <TouchableOpacity
              style={[
                styles.creditPackCard,
                selectedCreditPack === 'PACK_10' && styles.creditPackCardSelected,
              ]}
              onPress={() => setSelectedCreditPack('PACK_10')}
              activeOpacity={0.8}
            >
              <View style={styles.creditPackHeader}>
                <View style={[
                  styles.radioButtonCompact,
                  selectedCreditPack === 'PACK_10' && styles.radioButtonSelected,
                ]}>
                  {selectedCreditPack === 'PACK_10' && (
                    <View style={styles.radioButtonInnerCompact} />
                  )}
                </View>
                <View style={styles.creditPackInfo}>
                  <Text style={styles.creditPackCredits}>10 Credits</Text>
                  <Text style={styles.creditPackPrice}>{getCreditPackPrice('PACK_10')}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.creditPackCard,
                selectedCreditPack === 'PACK_20' && styles.creditPackCardSelected,
              ]}
              onPress={() => setSelectedCreditPack('PACK_20')}
              activeOpacity={0.8}
            >
              <View style={styles.creditPackHeader}>
                <View style={[
                  styles.radioButtonCompact,
                  selectedCreditPack === 'PACK_20' && styles.radioButtonSelected,
                ]}>
                  {selectedCreditPack === 'PACK_20' && (
                    <View style={styles.radioButtonInnerCompact} />
                  )}
                </View>
                <View style={styles.creditPackInfo}>
                  <Text style={styles.creditPackCredits}>20 Credits</Text>
                  <Text style={styles.creditPackPrice}>{getCreditPackPrice('PACK_20')}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.creditPackCard,
                selectedCreditPack === 'PACK_50' && styles.creditPackCardSelected,
              ]}
              onPress={() => setSelectedCreditPack('PACK_50')}
              activeOpacity={0.8}
            >
              <View style={styles.creditPackHeader}>
                <View style={[
                  styles.radioButtonCompact,
                  selectedCreditPack === 'PACK_50' && styles.radioButtonSelected,
                ]}>
                  {selectedCreditPack === 'PACK_50' && (
                    <View style={styles.radioButtonInnerCompact} />
                  )}
                </View>
                <View style={styles.creditPackInfo}>
                  <Text style={styles.creditPackCredits}>50 Credits</Text>
                  <Text style={styles.creditPackPrice}>{getCreditPackPrice('PACK_50')}</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Credit Pack Features */}
          <View style={styles.creditFeaturesSection}>
            <View style={styles.featureRowCompact}>
              <View style={styles.featureIconCompact}>
                <Check size={16} color={Colors.ember} />
              </View>
              <Text style={styles.featureTextCompact}>Credits never expire</Text>
            </View>
            <View style={styles.featureRowCompact}>
              <View style={styles.featureIconCompact}>
                <Check size={16} color={Colors.ember} />
              </View>
              <Text style={styles.featureTextCompact}>Stack with subscription credits</Text>
            </View>
          </View>

          {/* Footer for Credits - Compact */}
          <View style={styles.footerCompact}>
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={handlePurchaseCredits}
              disabled={isPurchasingCredits}
              activeOpacity={0.8}
            >
              <View style={styles.subscribeButtonInnerCompact}>
                {isPurchasingCredits ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.subscribeTextCompact}>
                    Buy {CREDIT_PACKS[selectedCreditPack].credits} Credits
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            <Text style={styles.legalTextCompact}>
              One-time purchase. Credits added immediately.
            </Text>
          </View>
        </>
      ) : (
        <>
          {/* Features */}
          <View style={styles.featuresSection}>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <feature.icon size={18} color={Colors.ember} />
                </View>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
            ))}
          </View>

          {/* Plans */}
          <View style={styles.plansSection}>
            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'annual' && styles.planCardSelected,
              ]}
              onPress={() => handleSelectPlan('annual')}
              activeOpacity={0.8}
            >
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>SAVE 33%</Text>
              </View>
              <View style={styles.planHeader}>
                <View style={[
                  styles.radioButton,
                  selectedPlan === 'annual' && styles.radioButtonSelected,
                ]}>
                  {selectedPlan === 'annual' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>Annual</Text>
                  <Text style={styles.planPrice}>
                    {annualPrice}
                    <Text style={styles.planPeriod}>/year</Text>
                  </Text>
                </View>
              </View>
              <Text style={styles.planSubtext}>
                Just {annualMonthlyPrice}/month, billed annually
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.planCard,
                selectedPlan === 'monthly' && styles.planCardSelected,
              ]}
              onPress={() => handleSelectPlan('monthly')}
              activeOpacity={0.8}
            >
              <View style={styles.planHeader}>
                <View style={[
                  styles.radioButton,
                  selectedPlan === 'monthly' && styles.radioButtonSelected,
                ]}>
                  {selectedPlan === 'monthly' && (
                    <View style={styles.radioButtonInner} />
                  )}
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>Monthly</Text>
                  <Text style={styles.planPrice}>
                    {monthlyPrice}
                    <Text style={styles.planPeriod}>/month</Text>
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Promo Code Section */}
          <View style={styles.promoSection}>
            <View style={styles.promoHeader}>
              <Ticket size={16} color={Colors.grayLight} />
              <View style={styles.promoLabelContainer}>
                <Text style={styles.promoLabel}>Have a promo code?</Text>
                <Text style={styles.promoDescription}>
                  Valid for 1 month from activation, then charged monthly
                </Text>
              </View>
            </View>
            <View style={styles.promoInputRow}>
              <TextInput
                style={styles.promoInput}
                placeholder="Enter code"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={promoCode}
                onChangeText={(text) => {
                  setPromoCode(text);
                  setPromoError(null);
                  setPromoSuccess(null);
                }}
                onFocus={() => {
                  // Auto-scroll to show Subscribe button when promo input is focused
                  setTimeout(() => {
                    scrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 300);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isApplyingPromo}
              />
              <TouchableOpacity
                style={[
                  styles.promoApplyButton,
                  (!promoCode.trim() || isApplyingPromo) && styles.promoApplyButtonDisabled,
                ]}
                onPress={handleApplyPromoCode}
                disabled={!promoCode.trim() || isApplyingPromo}
                activeOpacity={0.7}
              >
                {isApplyingPromo ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.promoApplyText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
            {promoError && (
              <Text style={styles.promoErrorText}>{promoError}</Text>
            )}
            {promoSuccess && (
              <View style={styles.promoSuccessRow}>
                <Check size={14} color="#4CAF50" />
                <Text style={styles.promoSuccessText}>{promoSuccess}</Text>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={handleSubscribe}
              disabled={isPurchasing}
              activeOpacity={0.8}
            >
              <View style={styles.subscribeButtonInner}>
                {isPurchasing ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.subscribeText}>Subscribe Now</Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={Colors.grayLight} />
              ) : (
                <Text style={styles.restoreText}>Restore Purchases</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.legalText}>
              Cancel anytime. Subscription auto-renews unless canceled at least 24 hours before the end of the current period.
            </Text>
          </View>
        </>
      )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Confetti overlay - on top of everything */}
      <Confetti show={showConfetti} />
    </View>
  );
}

const styles = StyleSheet.create({
  modalWrapper: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 14,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    backgroundColor: Colors.ember,
  },
  // Compact hero for credits view
  heroSectionCompact: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  iconContainerCompact: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    backgroundColor: Colors.ember,
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.medium,
    fontWeight: '700' as const,
    color: Colors.cream,
    marginBottom: 6,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 26,
    fontFamily: Fonts.medium,
    fontWeight: '700' as const,
    color: Colors.cream,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  subtitleCompact: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  featuresSection: {
    marginBottom: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(243, 106, 63, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.cream,
    flex: 1,
  },
  // Compact feature row for credits view
  featureRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  featureIconCompact: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(243, 106, 63, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureTextCompact: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.cream,
    flex: 1,
  },
  plansSection: {
    gap: 8,
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelected: {
    borderColor: Colors.ember,
    backgroundColor: 'rgba(243, 106, 63, 0.1)',
  },
  saveBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: Colors.ember,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  saveBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    fontWeight: '700' as const,
    color: Colors.cream,
    letterSpacing: 0.5,
  },
  // Compact save badge for credits view
  saveBadgeCompact: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: Colors.ember,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  saveBadgeTextCompact: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    fontWeight: '700' as const,
    color: Colors.cream,
    letterSpacing: 0.5,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioButtonSelected: {
    borderColor: Colors.ember,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.ember,
  },
  // Compact radio button for credits view
  radioButtonCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioButtonInnerCompact: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.ember,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    fontWeight: '600' as const,
    color: Colors.cream,
    marginBottom: 1,
  },
  planPrice: {
    fontSize: 18,
    fontFamily: Fonts.medium,
    fontWeight: '700' as const,
    color: Colors.cream,
  },
  planPeriod: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: Colors.grayLight,
  },
  planSubtext: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginTop: 6,
    marginLeft: 34,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 12,
    paddingBottom: 28,
  },
  footerCompact: {
    marginTop: 'auto',
    paddingTop: 10,
    paddingBottom: 20,
  },
  subscribeButton: {
    marginBottom: 12,
  },
  subscribeButtonInner: {
    paddingVertical: 16,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.ember,
  },
  subscribeButtonInnerCompact: {
    paddingVertical: 16,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.ember,
  },
  subscribeText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    fontWeight: '600' as const,
    color: Colors.cream,
    letterSpacing: 0.3,
  },
  subscribeTextCompact: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    fontWeight: '600' as const,
    color: Colors.cream,
    letterSpacing: 0.3,
  },
  restoreButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  restoreText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
  },
  legalText: {
    fontSize: 10,
    fontFamily: Fonts.regular,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 4,
  },
  legalTextCompact: {
    fontSize: 10,
    fontFamily: Fonts.regular,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    lineHeight: 13,
    marginTop: 2,
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  confettiParticle: {
    position: 'absolute',
    top: -20,
    borderRadius: 2,
  },
  promoSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  promoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 10,
  },
  promoLabelContainer: {
    flex: 1,
  },
  promoLabel: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
  },
  promoDescription: {
    fontSize: 10,
    fontFamily: Fonts.regular,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 2,
    lineHeight: 13,
  },
  promoInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  promoInput: {
    flex: 1,
    backgroundColor: Colors.darkSurface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.cream,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  promoApplyButton: {
    backgroundColor: Colors.ember,
    borderRadius: 100,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
  },
  promoApplyButtonDisabled: {
    backgroundColor: 'rgba(243, 106, 63, 0.4)',
  },
  promoApplyText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    fontWeight: '600' as const,
    color: Colors.cream,
  },
  promoErrorText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: '#FF6B6B',
    marginTop: 8,
  },
  promoSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  promoSuccessText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: '#4CAF50',
  },
  // Current Credits Display - Inline version
  currentCreditsDisplayInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(243, 106, 63, 0.15)',
    borderRadius: 12,
  },
  currentCreditsLabelInline: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
  },
  currentCreditsValueInline: {
    fontSize: 20,
    fontFamily: Fonts.medium,
    fontWeight: '700' as const,
    color: Colors.ember,
  },
  // Credit Packs
  creditPacksSection: {
    marginBottom: 10,
  },
  creditPacksTitle: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    fontWeight: '600' as const,
    color: Colors.cream,
    marginBottom: 10,
    textAlign: 'center',
  },
  creditPackCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 8,
  },
  creditPackCardSelected: {
    borderColor: Colors.ember,
    backgroundColor: 'rgba(243, 106, 63, 0.1)',
  },
  creditPackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creditPackInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditPackCredits: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    fontWeight: '600' as const,
    color: Colors.cream,
  },
  creditPackPrice: {
    fontSize: 18,
    fontFamily: Fonts.medium,
    fontWeight: '700' as const,
    color: Colors.cream,
  },
  creditPackSubtext: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.grayLight,
    marginTop: 4,
    marginLeft: 30,
  },
  creditFeaturesSection: {
    marginBottom: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
});
