export type StylePreference = 'Playful' | 'Professional' | 'Dreamy';

export interface UserProfile {
  name: string;
  style: StylePreference;
  voiceRecordingUri?: string;
}

export interface Video {
  id: string;
  uri: string;
  prompt: string;
  createdAt: number;
}
