// Typography constants for the app
// Uses Inter font family: Inter Bold for titles, Inter Regular for subtext

export const Fonts = {
  // For titles, headings, and emphasized text
  title: 'Inter_700Bold',
  
  // For body text, subtitles, and regular text
  regular: 'Inter_400Regular',
} as const;

export type FontFamily = typeof Fonts[keyof typeof Fonts];

