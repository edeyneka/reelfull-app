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
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  previewImage?: string;
}

export interface Project {
  _id: string;
  _creationTime: number;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  files?: Array<string>;
}
