import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react-native';
import Svg, { Defs, RadialGradient, Stop, Circle as SvgCircle } from 'react-native-svg';
import Colors from '@/constants/colors';
import { Fonts } from '@/constants/typography';

const BACKDROP_SIZE = 52;

function SoftCircleBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ width: BACKDROP_SIZE, height: BACKDROP_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={BACKDROP_SIZE}
        height={BACKDROP_SIZE}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient id="softGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="black" stopOpacity="0.2" />
            <Stop offset="40%" stopColor="black" stopOpacity="0.1" />
            <Stop offset="80%" stopColor="black" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <SvgCircle cx={BACKDROP_SIZE / 2} cy={BACKDROP_SIZE / 2} r={BACKDROP_SIZE / 2} fill="url(#softGlow)" />
      </Svg>
      {children}
    </View>
  );
}

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
    text: 'Toggle these to customize your video \u2014 turn voiceover, music, or captions on or off before downloading',
    tooltipPosition: 'above',
  },
  {
    text: 'Tap to save the video with your chosen settings. Check your camera roll afterwards!',
    tooltipPosition: 'below',
  },
];

interface VideoPreviewOnboardingProps {
  visible: boolean;
  onComplete: () => void;
  spotlightRects: (SpotlightRect | null)[];
  safeAreaTop?: number;
}

export default function VideoPreviewOnboarding({
  visible,
  onComplete,
  spotlightRects,
  safeAreaTop = 54,
}: VideoPreviewOnboardingProps) {
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

  const handlePrev = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    }
  }, [currentSlide]);

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

    // Slide 0 (toggles): narrower tooltip, positioned to the left and vertically centered with the cutout
    if (currentSlide === 0) {
      const tooltipMargin = 16;
      const tooltipWidth = SCREEN_WIDTH * 0.65;
      const cutoutCenterY = cutout.y + cutout.height / 2;

      return {
        position: 'absolute' as const,
        right: cutout.width + CUTOUT_PADDING + tooltipMargin + 12,
        top: cutoutCenterY - 40, // roughly center the tooltip card vertically
        width: tooltipWidth,
      };
    }

    // Slide 1 (download): standard above/below positioning
    const tooltipMargin = 16;
    const estimatedTooltipHeight = 100;

    let position = slide.tooltipPosition;
    if (position === 'below') {
      const bottomEdge = cutout.y + cutout.height + tooltipMargin + estimatedTooltipHeight;
      if (bottomEdge > SCREEN_HEIGHT) position = 'above';
    } else {
      const topEdge = cutout.y - tooltipMargin - estimatedTooltipHeight;
      if (topEdge < safeAreaTop) position = 'below';
    }

    if (position === 'above') {
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
          pointerEvents="none"
        />
      ) : (
        /* Full overlay when no cutout */
        <View style={styles.fullOverlay} pointerEvents="none" />
      )}

      {/* Left tap zone - go to previous slide */}
      <TouchableOpacity
        style={styles.tapZoneLeft}
        onPress={handlePrev}
        activeOpacity={1}
      />

      {/* Right tap zone - go to next slide */}
      <TouchableOpacity
        style={styles.tapZoneRight}
        onPress={handleNext}
        activeOpacity={1}
      />

      {/* Tooltip */}
      <View style={getTooltipStyle()} pointerEvents="none">
        <View style={styles.tooltipCard}>
          <Text style={styles.tooltipText}>{slide.text}</Text>
        </View>
      </View>

      {/* Dot indicators fixed at top center */}
      <View style={[styles.navRow, { top: safeAreaTop + 8 }]} pointerEvents="none">
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

      {/* Left arrow - visible from the second slide onwards */}
      {currentSlide > 0 && (
        <View style={styles.arrowHintLeft} pointerEvents="none">
          <SoftCircleBackdrop>
            <ChevronLeft
              size={24}
              color="rgba(255, 255, 255, 0.85)"
              strokeWidth={1.5}
            />
          </SoftCircleBackdrop>
        </View>
      )}

      {/* Right arrow / checkmark */}
      <View style={styles.arrowHintRight} pointerEvents="none">
        <SoftCircleBackdrop>
          {isLastSlide ? (
            <Check
              size={24}
              color="rgba(255, 255, 255, 0.85)"
              strokeWidth={1.5}
            />
          ) : (
            <ChevronRight
              size={24}
              color="rgba(255, 255, 255, 0.85)"
              strokeWidth={1.5}
            />
          )}
        </SoftCircleBackdrop>
      </View>
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
  tapZoneLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH / 2,
    height: SCREEN_HEIGHT,
  },
  tapZoneRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: SCREEN_WIDTH / 2,
    height: SCREEN_HEIGHT,
  },
  arrowHintRight: {
    position: 'absolute',
    right: 4,
    top: SCREEN_HEIGHT / 2 - 26,
  },
  arrowHintLeft: {
    position: 'absolute',
    left: 4,
    top: SCREEN_HEIGHT / 2 - 26,
  },
});
