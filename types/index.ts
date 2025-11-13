export type StylePreference = 'Playful' | 'Professional' | 'Dreamy';

export interface UserProfile {
  name: string;
  style: StylePreference;
  voiceRecordingUri?: string;
}

export interface Video {
  id: string;
  uri?: string;
  prompt: string;
  createdAt: number;
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'rendering';
  previewImage?: string;
}

export interface Project {
  _id: string;
  _creationTime: number;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rendering';
  videoUrl?: string;
  renderedVideoUrl?: string;
  error?: string;
  files?: Array<string>;
  thumbnail?: string;
  thumbnailUrl?: string;
  fileUrls?: Array<string>;
  audioUrl?: string;
  musicUrl?: string;
}
