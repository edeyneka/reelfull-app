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
  name?: string; // AI-generated project name (e.g., "Summer Vibes")
  script?: string; // The actual generated script
  createdAt: number;
  status: 'draft' | 'pending' | 'processing' | 'ready' | 'failed';
  projectId?: string;
  error?: string;
  thumbnailUrl?: string; // Thumbnail image URL for grid display
  duration?: number; // Video duration in seconds
}

// Convex types placeholder - will be replaced with generated types
export type ConvexId<T extends string> = string & { __tableName: T };
