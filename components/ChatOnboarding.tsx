import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/typography';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Padding around the cutout spotlight
const CUTOUT_PADDING = 8;
const CUTOUT_BORDER_RADIUS = 25;
// Large border trick: a border this wide covers the entire screen around the cutout
const OVERLAY_BORDER = 2000;

export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OnboardingSlide {
  text: string;
  tooltipPosition: 'above' | 'below';
}

const SLIDES: OnboardingSlide[] = [
  {
    text: 'Here\u2019s your script! Tap the icons below to copy it or hear a voice preview',
    tooltipPosition: 'below',
  },
  {
    text: 'Tap here to change the voice, adjust its speed, or lock your clip order',
    tooltipPosition: 'below',
  },
  {
    text: 'Want changes? Ask to make the script longer, shorter, more emotional, or professional',
    tooltipPosition: 'above',
  },
  {
    text: 'When you\u2019re happy with the script, tap Generate. The latest version in the chat becomes your narration',
    tooltipPosition: 'below',
  },
];

interface ChatOnboardingProps {
  visible: boolean;
  onComplete: () => void;
  spotlightRects: (SpotlightRect | null)[];
  safeAreaTop?: number; // Safe area inset top (for status bar)
}

export default function ChatOnboarding({
  visible,
  onComplete,
  spotlightRects,
  safeAreaTop = 54,
}: ChatOnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      setCurrentSlide(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  const handleNext = useCallback(() => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      // Last slide - complete onboarding
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        onComplete();
      });
    }
  }, [currentSlide, onComplete, fadeAnim]);

  if (!visible) return null;

  const slide = SLIDES[currentSlide];
  const rect = spotlightRects[currentSlide];
  const isLastSlide = currentSlide === SLIDES.length - 1;

  // If no rect measured yet, show full overlay with text centered
  const hasRect = rect && rect.width > 0 && rect.height > 0;

  // Calculate cutout area with padding
  const cutout = hasRect
    ? {
        x: rect.x - CUTOUT_PADDING,
        y: rect.y - CUTOUT_PADDING,
        width: rect.width + CUTOUT_PADDING * 2,
        height: rect.height + CUTOUT_PADDING * 2,
      }
    : null;

  // Calculate tooltip position
  const getTooltipStyle = () => {
    if (!cutout) {
      return {
        position: 'absolute' as const,
        left: 24,
        right: 24,
        top: SCREEN_HEIGHT * 0.4,
      };
    }

    const tooltipMargin = 16;

    if (slide.tooltipPosition === 'above') {
      return {
        position: 'absolute' as const,
        left: 24,
        right: 24,
        bottom: SCREEN_HEIGHT - cutout.y + tooltipMargin,
      };
    } else {
      return {
        position: 'absolute' as const,
        left: 24,
        right: 24,
        top: cutout.y + cutout.height + tooltipMargin,
      };
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]} pointerEvents="box-none">
      {/* Overlay with rounded cutout */}
      {cutout ? (
        <View
          style={{
            position: 'absolute',
            top: cutout.y - OVERLAY_BORDER,
            left: cutout.x - OVERLAY_BORDER,
            width: cutout.width + OVERLAY_BORDER * 2,
            height: cutout.height + OVERLAY_BORDER * 2,
            borderWidth: OVERLAY_BORDER,
            borderColor: 'rgba(0, 0, 0, 0.6)',
            borderRadius: OVERLAY_BORDER + CUTOUT_BORDER_RADIUS,
          }}
        />
      ) : (
        /* Full overlay when no cutout */
        <View style={styles.fullOverlay} />
      )}

      {/* Tooltip */}
      <View style={getTooltipStyle()}>
        <View style={styles.tooltipCard}>
          <Text style={styles.tooltipText}>{slide.text}</Text>
        </View>
      </View>

      {/* Dot indicators fixed at top center */}
      <View style={[styles.navRow, { top: safeAreaTop + 8 }]}>
        <View style={styles.dotsContainer}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === currentSlide && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Next / Got it -- fixed position, centered, above composer-area tooltip */}
      <TouchableOpacity
        style={styles.nextButton}
        onPress={handleNext}
        activeOpacity={0.7}
      >
        <Text style={styles.nextButtonText}>
          {isLastSlide ? 'Got it!' : 'Next'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  tooltipCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tooltipText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.ink,
    lineHeight: 20,
  },
  navRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    backgroundColor: Colors.white,
  },
  nextButton: {
    position: 'absolute',
    bottom: 200,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 10,
  },
  nextButtonText: {
    fontSize: 16,
    fontFamily: Fonts.medium,
    color: 'rgba(255, 255, 255, 0.85)',
  },
});
