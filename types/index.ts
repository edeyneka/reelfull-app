export type StylePreference = 'Playful' | 'Professional' | 'Dreamy';

export interface UserProfile {
  name: string;
  style: StylePreference;
}

export interface Video {
  id: string;
  uri: string;
  prompt: string;
  createdAt: number;
}
