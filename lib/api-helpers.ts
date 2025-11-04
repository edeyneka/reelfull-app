/**
 * API Helper Functions for Convex Integration
 * 
 * This file contains reusable helper functions for common API operations
 */

import { Id } from "@/convex/_generated/dataModel";

/**
 * Upload a file to Convex storage
 * @param generateUploadUrl - Convex mutation function to get upload URL
 * @param fileUri - Local file URI
 * @param contentType - MIME type (e.g., 'audio/mp3', 'image/jpeg', 'video/mp4')
 * @returns Storage ID
 */
export async function uploadFileToConvex(
  generateUploadUrl: () => Promise<string>,
  fileUri: string,
  contentType?: string
): Promise<Id<"_storage">> {
  // 1. Generate upload URL
  const uploadUrl = await generateUploadUrl();

  // 2. Fetch file and convert to blob
  const response = await fetch(fileUri);
  const blob = await response.blob();

  // 3. Upload to Convex
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType || blob.type,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.statusText}`);
  }

  // 4. Get and return storage ID
  const { storageId } = await uploadResponse.json();
  return storageId as Id<"_storage">;
}

/**
 * Upload multiple media files to Convex storage
 * @param generateUploadUrl - Convex mutation function to get upload URL
 * @param mediaUris - Array of media items with URI and type
 * @returns Array of upload metadata
 */
export async function uploadMediaFiles(
  generateUploadUrl: () => Promise<string>,
  mediaUris: Array<{ uri: string; type: "image" | "video" }>
): Promise<
  Array<{
    storageId: Id<"_storage">;
    filename: string;
    contentType: string;
    size: number;
  }>
> {
  const uploads = [];

  for (const media of mediaUris) {
    try {
      // 1. Generate upload URL
      const uploadUrl = await generateUploadUrl();

      // 2. Fetch file
      const response = await fetch(media.uri);
      const blob = await response.blob();

      // 3. Determine content type
      const contentType = media.type === "video" ? "video/mp4" : "image/jpeg";

      // 4. Upload to Convex
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      const { storageId } = await uploadResponse.json();

      // 5. Add metadata
      uploads.push({
        storageId: storageId as Id<"_storage">,
        filename: `${media.type}_${Date.now()}.${media.type === "video" ? "mp4" : "jpg"}`,
        contentType,
        size: blob.size,
      });

      console.log(`Uploaded ${media.type}: ${storageId}`);
    } catch (error) {
      console.error(`Failed to upload ${media.type}:`, error);
      throw error;
    }
  }

  return uploads;
}

/**
 * Map app style preference to backend style
 */
export function mapStyleToBackend(
  style: "Playful" | "Professional" | "Dreamy"
): "playful" | "professional" | "travel" {
  const styleMap = {
    Playful: "playful",
    Professional: "professional",
    Dreamy: "travel",
  } as const;

  return styleMap[style];
}

/**
 * Map backend style to app style preference
 */
export function mapStyleToApp(
  style: "playful" | "professional" | "travel"
): "Playful" | "Professional" | "Dreamy" {
  const styleMap = {
    playful: "Playful",
    professional: "Professional",
    travel: "Dreamy",
  } as const;

  return styleMap[style];
}

/**
 * Calculate video generation progress based on project data
 */
export function calculateProgress(project: {
  script?: string;
  audioUrl?: string;
  musicUrl?: string;
  videoUrls?: string[];
}): {
  progress: number;
  stage: "script" | "audio" | "music" | "videos" | "complete";
  assetsReady: {
    script: boolean;
    audio: boolean;
    music: boolean;
    videos: boolean;
  };
} {
  const assetsReady = {
    script: !!project.script,
    audio: !!project.audioUrl,
    music: !!project.musicUrl,
    videos: (project.videoUrls?.length || 0) > 0,
  };

  const completedAssets = Object.values(assetsReady).filter(Boolean).length;
  const progress = (completedAssets / 4) * 100;

  // Determine current stage
  let stage: "script" | "audio" | "music" | "videos" | "complete";
  if (!assetsReady.script) {
    stage = "script";
  } else if (!assetsReady.audio) {
    stage = "audio";
  } else if (!assetsReady.music) {
    stage = "music";
  } else if (!assetsReady.videos) {
    stage = "videos";
  } else {
    stage = "complete";
  }

  return { progress, stage, assetsReady };
}

/**
 * Format phone number for backend (E.164 format)
 * @param phoneNumber - Raw phone number input
 * @param countryCode - Country code (default: "+1" for US)
 * @returns Formatted phone number
 */
export function formatPhoneNumber(
  phoneNumber: string,
  countryCode: string = "+1"
): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, "");

  // If it already starts with country code, return as is
  if (phoneNumber.startsWith("+")) {
    return phoneNumber;
  }

  // Add country code
  return `${countryCode}${digits}`;
}

/**
 * Validate OTP code format
 */
export function validateOTP(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Format project creation timestamp
 */
export function formatProjectDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Get status display info
 */
export function getStatusInfo(
  status?: "processing" | "completed" | "failed" | "rendering"
): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case "processing":
      return { label: "Processing", color: "#FF6B35", icon: "⏳" };
    case "completed":
      return { label: "Ready", color: "#4CAF50", icon: "✓" };
    case "failed":
      return { label: "Failed", color: "#F44336", icon: "✗" };
    case "rendering":
      return { label: "Rendering", color: "#FFC107", icon: "🎬" };
    default:
      return { label: "Unknown", color: "#9E9E9E", icon: "?" };
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Attempt ${attempt + 1} failed:`, lastError.message);

      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

/**
 * Safe API call wrapper with error handling
 */
export async function safeAPICall<T>(
  apiCall: () => Promise<T>,
  errorMessage: string = "Operation failed"
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await apiCall();
    return { success: true, data };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error) || errorMessage;
    console.error(errorMessage, errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Check if project is ready for viewing
 */
export function isProjectReady(project: {
  status?: string;
  videoUrls?: string[];
  renderedVideoUrl?: string;
}): boolean {
  if (project.status !== "completed") return false;
  return !!(project.renderedVideoUrl || (project.videoUrls?.length || 0) > 0);
}

/**
 * Get the best video URL from project
 * Prioritizes renderedVideoUrl over first videoUrl
 */
export function getProjectVideoUrl(project: {
  videoUrls?: string[];
  renderedVideoUrl?: string;
}): string | null {
  return (
    project.renderedVideoUrl ||
    (project.videoUrls && project.videoUrls.length > 0
      ? project.videoUrls[0]
      : null)
  );
}

/**
 * Estimate time remaining based on stage
 */
export function estimateTimeRemaining(
  stage: "script" | "audio" | "music" | "videos" | "complete"
): string {
  const estimates = {
    script: "~30 seconds",
    audio: "~20 seconds",
    music: "~15 seconds",
    videos: "~2 minutes",
    complete: "Done!",
  };

  return estimates[stage];
}

/**
 * Get friendly stage name for display
 */
export function getStageName(
  stage: "script" | "audio" | "music" | "videos" | "complete"
): string {
  const names = {
    script: "Writing script",
    audio: "Generating voiceover",
    music: "Creating background music",
    videos: "Animating images",
    complete: "Finalizing video",
  };

  return names[stage];
}

/**
 * Debounce function for search/input
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Extract file extension from URI
 */
export function getFileExtension(uri: string): string {
  const match = uri.match(/\.([^./?]+)($|\?)/);
  return match ? match[1].toLowerCase() : "";
}

/**
 * Check if file is a video based on URI
 */
export function isVideo(uri: string): boolean {
  const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm"];
  const ext = getFileExtension(uri);
  return videoExtensions.includes(ext);
}

/**
 * Check if file is an image based on URI
 */
export function isImage(uri: string): boolean {
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "heic"];
  const ext = getFileExtension(uri);
  return imageExtensions.includes(ext);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

