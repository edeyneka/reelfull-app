export type StylePreference = 'Playful' | 'Professional' | 'Dreamy';

// Backend style mapping
export type BackendStyle = 'playful' | 'professional' | 'travel';

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

// Convex types placeholder - will be replaced with generated types
export type ConvexId<T extends string> = string & { __tableName: T };
