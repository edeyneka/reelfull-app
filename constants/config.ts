/**
 * App Configuration
 * 
 * Toggle these flags to enable/disable features for dev vs prod builds
 */

// Set to true to enable test run mode features (sample media, test buttons, etc.)
// Note: Onboarding always shows for authenticated users regardless of this flag
export const ENABLE_TEST_RUN_MODE = false;

// Set to false to hide style preference during onboarding and settings
// When hidden, the default style "professional" is used automatically
// This should be false when using Claude v2 pipeline (USE_CLAUDE_SCRIPT_GENERATION=true)
// as the v2 pipeline uses a fixed conversational style
export const ENABLE_STYLE_PREFERENCE = false;

// Default style used when ENABLE_STYLE_PREFERENCE is false
export const DEFAULT_STYLE = "professional";

// You can add more feature flags here as needed
// export const ENABLE_DEBUG_LOGGING = true;
// export const ENABLE_ANALYTICS = false;

