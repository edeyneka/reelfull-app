import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Sparkles, Zap, Crown } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/typography';
import { usePaywall } from '@/contexts/PaywallContext';
import * as Haptics from 'expo-haptics';

type PlanType = 'monthly' | 'annual';

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    monthlyPackage,
    annualPackage,
    purchasePackage,
    restorePurchases,
    isLoading,
  } = usePaywall();
  
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const handleSelectPlan = useCallback((plan: PlanType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(plan);
  }, []);

  const handleSubscribe = useCallback(async () => {
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [selectedPlan, monthlyPackage, annualPackage, purchasePackage, router]);

  const handleRestore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    
    try {
      const success = await restorePurchases();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } finally {
      setIsRestoring(false);
    }
  }, [restorePurchases, router]);

  const monthlyPrice = monthlyPackage?.product?.priceString || '$9.99';
  const annualPrice = annualPackage?.product?.priceString || '$39.99';
  const annualMonthlyPrice = annualPackage?.product?.price 
    ? `$${(annualPackage.product.price / 12).toFixed(2)}`
    : '$3.33';

  const features = [
    { icon: Zap, text: 'Unlimited video generations' },
    { icon: Sparkles, text: 'Premium AI voice cloning' },
    { icon: Crown, text: 'Priority rendering queue' },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.orange} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={['#0A0A0A', '#1A1A1A', '#0A0A0A']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 12 }]}
        onPress={handleClose}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <X size={24} color={Colors.white} strokeWidth={2} />
      </TouchableOpacity>

      {/* Hero Section */}
      <View style={styles.heroSection}>
        <LinearGradient
          colors={['#FF6B35', '#FF8C42', '#FFB347']}
          style={styles.iconContainer}
        >
          <Crown size={36} color={Colors.white} />
        </LinearGradient>
        <Text style={styles.title}>Unlock Reelful Pro</Text>
        <Text style={styles.subtitle}>
          Create unlimited stunning videos with premium AI features
        </Text>
      </View>

      {/* Features */}
      <View style={styles.featuresSection}>
        {features.map((feature, index) => (
          <View key={index} style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <feature.icon size={18} color={Colors.orange} />
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

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handleSubscribe}
          disabled={isPurchasing}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#FF6B35', '#FF8C42']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.subscribeGradient}
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.subscribeText}>Subscribe Now</Text>
            )}
          </LinearGradient>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 24,
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
    marginTop: 50,
    marginBottom: 20,
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 26,
    fontFamily: Fonts.title,
    fontWeight: '700' as const,
    color: Colors.white,
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
  featuresSection: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.white,
    flex: 1,
  },
  plansSection: {
    gap: 10,
  },
  planCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelected: {
    borderColor: Colors.orange,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  saveBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: Colors.orange,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  saveBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.title,
    fontWeight: '700' as const,
    color: Colors.white,
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
    borderColor: Colors.orange,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.orange,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontFamily: Fonts.title,
    fontWeight: '600' as const,
    color: Colors.white,
    marginBottom: 1,
  },
  planPrice: {
    fontSize: 18,
    fontFamily: Fonts.title,
    fontWeight: '700' as const,
    color: Colors.white,
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
  subscribeButton: {
    marginBottom: 12,
  },
  subscribeGradient: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeText: {
    fontSize: 16,
    fontFamily: Fonts.title,
    fontWeight: '600' as const,
    color: Colors.white,
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
});
