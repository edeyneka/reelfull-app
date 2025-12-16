import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Platform } from 'react-native';
import Purchases, { 
  PurchasesPackage, 
  CustomerInfo, 
  PurchasesOffering,
  LOG_LEVEL
} from 'react-native-purchases';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useApp } from './AppContext';

const RC_API_KEY = process.env.EXPO_PUBLIC_RC_KEY || '';

export interface SubscriptionState {
  isSubscribed: boolean;
  isPro: boolean;
  activeSubscription: string | null;
  expirationDate: string | null;
}

export const [PaywallProvider, usePaywall] = createContextHook(() => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const syncedRef = useRef(false);
  
  // Get userId from AppContext for syncing subscription status
  const { userId } = useApp();
  
  // Mutation to sync subscription status to backend
  const updateSubscriptionStatus = useMutation(api.users.updateSubscriptionStatus);

  useEffect(() => {
    initializePurchases();
  }, []);

  const initializePurchases = async () => {
    try {
      if (Platform.OS === 'web') {
        console.log('[Paywall] Web platform detected, skipping RevenueCat initialization');
        setIsLoading(false);
        setIsInitialized(true);
        return;
      }

      if (!RC_API_KEY) {
        console.warn('[Paywall] RevenueCat API key not found');
        setError('RevenueCat API key not configured');
        setIsLoading(false);
        return;
      }

      console.log('[Paywall] Initializing RevenueCat...');
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      
      await Purchases.configure({ apiKey: RC_API_KEY });
      console.log('[Paywall] RevenueCat configured successfully');
      
      setIsInitialized(true);
      
      await fetchOfferings();
      await fetchCustomerInfo();
      
    } catch (err) {
      console.error('[Paywall] Error initializing RevenueCat:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize purchases');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOfferings = async () => {
    try {
      console.log('[Paywall] Fetching offerings...');
      const offerings = await Purchases.getOfferings();
      console.log('[Paywall] Offerings fetched:', offerings);
      
      if (offerings.current) {
        setOfferings(offerings.current);
        console.log('[Paywall] Current offering:', offerings.current.identifier);
        console.log('[Paywall] Available packages:', offerings.current.availablePackages.map(p => p.identifier));
      } else {
        console.warn('[Paywall] No current offering available');
      }
    } catch (err) {
      console.error('[Paywall] Error fetching offerings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch offerings');
    }
  };

  const fetchCustomerInfo = async () => {
    try {
      if (Platform.OS === 'web') return;
      
      console.log('[Paywall] Fetching customer info...');
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      console.log('[Paywall] Customer info fetched:', {
        activeSubscriptions: info.activeSubscriptions,
        entitlements: Object.keys(info.entitlements.active),
      });
    } catch (err) {
      console.error('[Paywall] Error fetching customer info:', err);
    }
  };

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        console.log('[Paywall] Purchases not available on web');
        return false;
      }

      console.log('[Paywall] Purchasing package:', pkg.identifier);
      const { customerInfo: newCustomerInfo } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(newCustomerInfo);
      
      // Check for any active entitlements (pro, premium, etc.)
      const activeEntitlements = Object.keys(newCustomerInfo.entitlements.active);
      const hasActiveEntitlement = activeEntitlements.length > 0;
      const hasProAccess = newCustomerInfo.entitlements.active['pro'] !== undefined;
      
      console.log('[Paywall] Purchase successful!');
      console.log('[Paywall] Active entitlements:', activeEntitlements);
      console.log('[Paywall] Has pro entitlement:', hasProAccess);
      console.log('[Paywall] Active subscriptions:', newCustomerInfo.activeSubscriptions);
      
      // Purchase succeeded if transaction completed - return true
      // The entitlement might take a moment to propagate, but purchase was successful
      return true;
    } catch (err: any) {
      if (err.userCancelled) {
        console.log('[Paywall] User cancelled purchase');
        return false;
      }
      console.error('[Paywall] Error purchasing package:', err);
      setError(err instanceof Error ? err.message : 'Purchase failed');
      return false;
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        console.log('[Paywall] Restore not available on web');
        return false;
      }

      console.log('[Paywall] Restoring purchases...');
      const restoredInfo = await Purchases.restorePurchases();
      setCustomerInfo(restoredInfo);
      
      // Check for any active entitlements or subscriptions
      const activeEntitlements = Object.keys(restoredInfo.entitlements.active);
      const hasActiveSubscription = restoredInfo.activeSubscriptions.length > 0;
      const hasAccess = activeEntitlements.length > 0 || hasActiveSubscription;
      
      console.log('[Paywall] Restore complete!');
      console.log('[Paywall] Active entitlements:', activeEntitlements);
      console.log('[Paywall] Active subscriptions:', restoredInfo.activeSubscriptions);
      console.log('[Paywall] Has access:', hasAccess);
      
      return hasAccess;
    } catch (err) {
      console.error('[Paywall] Error restoring purchases:', err);
      setError(err instanceof Error ? err.message : 'Restore failed');
      return false;
    }
  }, []);

  const identifyUser = useCallback(async (userId: string) => {
    try {
      if (Platform.OS === 'web') return;
      
      console.log('[Paywall] Identifying user:', userId);
      await Purchases.logIn(userId);
      await fetchCustomerInfo();
    } catch (err) {
      console.error('[Paywall] Error identifying user:', err);
    }
  }, []);

  const subscriptionState: SubscriptionState = useMemo(() => {
    if (Platform.OS === 'web' || !customerInfo) {
      return {
        isSubscribed: false,
        isPro: false,
        activeSubscription: null,
        expirationDate: null,
      };
    }

    // Check for 'pro' entitlement first, then any active entitlement
    const proEntitlement = customerInfo.entitlements.active['pro'];
    const activeEntitlements = Object.values(customerInfo.entitlements.active);
    const firstActiveEntitlement = activeEntitlements[0];
    
    // User is subscribed if they have any active entitlement OR active subscription
    const hasActiveEntitlement = activeEntitlements.length > 0;
    const hasActiveSubscription = customerInfo.activeSubscriptions.length > 0;
    const isSubscribed = hasActiveEntitlement || hasActiveSubscription;
    
    return {
      isSubscribed,
      isPro: isSubscribed,
      activeSubscription: customerInfo.activeSubscriptions[0] || null,
      expirationDate: proEntitlement?.expirationDate || firstActiveEntitlement?.expirationDate || null,
    };
  }, [customerInfo]);

  // Sync subscription status to backend on app load when user is subscribed
  useEffect(() => {
    const syncSubscriptionToBackend = async () => {
      if (!userId || !isInitialized || syncedRef.current) return;
      
      // Only sync if user has an active subscription
      if (subscriptionState.isSubscribed) {
        try {
          console.log('[Paywall] Syncing subscription status to backend on load');
          await updateSubscriptionStatus({
            userId,
            isPremium: true,
            subscriptionExpiresAt: subscriptionState.expirationDate || undefined,
          });
          syncedRef.current = true;
          console.log('[Paywall] Subscription status synced to backend');
        } catch (err) {
          console.error('[Paywall] Failed to sync subscription status to backend:', err);
        }
      }
    };
    
    syncSubscriptionToBackend();
  }, [userId, isInitialized, subscriptionState.isSubscribed, subscriptionState.expirationDate, updateSubscriptionStatus]);

  const monthlyPackage = useMemo(() => {
    return offerings?.availablePackages.find(
      pkg => pkg.packageType === 'MONTHLY' || pkg.identifier === '$rc_monthly'
    ) || null;
  }, [offerings]);

  const annualPackage = useMemo(() => {
    return offerings?.availablePackages.find(
      pkg => pkg.packageType === 'ANNUAL' || pkg.identifier === '$rc_annual'
    ) || null;
  }, [offerings]);

  return useMemo(() => ({
    isInitialized,
    isLoading,
    error,
    offerings,
    customerInfo,
    subscriptionState,
    monthlyPackage,
    annualPackage,
    purchasePackage,
    restorePurchases,
    identifyUser,
    fetchCustomerInfo,
  }), [
    isInitialized,
    isLoading,
    error,
    offerings,
    customerInfo,
    subscriptionState,
    monthlyPackage,
    annualPackage,
    purchasePackage,
    restorePurchases,
    identifyUser,
  ]);
});
