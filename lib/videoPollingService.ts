import { useEffect, useRef } from 'react';
import { useConvex, useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useApp } from '@/contexts/AppContext';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Hook to poll for video generation status and update local state
 * This monitors pending videos and updates them when they're ready
 */
export function useVideoPolling() {
  const { videos, updateVideoStatus } = useApp();
  const checkedVideos = useRef(new Set<string>());
  const renderTriggered = useRef(new Set<string>());
  const convex = useConvex();
  const renderVideo = useAction(api.render.renderVideo);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Get all pending/processing videos
    const pendingVideos = videos.filter(
      v => (v.status === 'pending' || v.status === 'processing') && v.projectId
    );

    // If no pending videos, clear interval and return
    if (pendingVideos.length === 0) {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
      return;
    }

    // Poll function to check all pending videos
    const pollVideos = async () => {
      for (const video of pendingVideos) {
        try {
          const project = await convex.query(api.tasks.getProject, { id: video.projectId as any });
          
          if (!project) continue;

          const uniqueKey = `${video.id}-${project.status}`;
          
          // Check if all media assets are ready but video not rendered yet
          const hasAllMediaAssets = !!(
            project.audioUrl && 
            project.musicUrl
          );
          
          // Update status based on project state
          if (project.status === 'completed' && project.renderedVideoUrl) {
            // Video is ready! But validate the URL first
            if (!checkedVideos.current.has(uniqueKey)) {
              // Validate that we have a non-empty video URL
              if (project.renderedVideoUrl && project.renderedVideoUrl.trim().length > 0) {
                console.log('[VideoPolling] Video ready:', video.id);
                console.log('[VideoPolling] Video URL:', project.renderedVideoUrl);
                updateVideoStatus(video.id, 'ready', project.renderedVideoUrl);
                checkedVideos.current.add(uniqueKey);
                
                // Send notification
                sendVideoReadyNotification(project.prompt || 'Your video');
              } else {
                console.error('[VideoPolling] Video marked as ready but URL is empty:', video.id);
                updateVideoStatus(video.id, 'failed', undefined, 'Video URL is empty');
              }
            }
          } else if (
            project.status === 'completed' && 
            hasAllMediaAssets &&
            !project.renderedVideoUrl && 
            !project.renderProgress &&
            !renderTriggered.current.has(video.id)
          ) {
            // Media assets ready, but rendering not started - trigger it!
            console.log('[VideoPolling] ✅ All media assets ready! Triggering render for:', video.id);
            console.log('[VideoPolling]   - audioUrl:', project.audioUrl ? "✓" : "✗");
            console.log('[VideoPolling]   - musicUrl:', project.musicUrl ? "✓" : "✗");
            console.log('[VideoPolling]   - videoUrls:', project.videoUrls?.length || 0, "videos");
            
            renderTriggered.current.add(video.id);
            
            // Update to processing status
            updateVideoStatus(video.id, 'processing');
            
            // Trigger render
            renderVideo({ projectId: video.projectId as any }).catch((error) => {
              console.error('[VideoPolling] Render error:', error);
              renderTriggered.current.delete(video.id); // Allow retry
              updateVideoStatus(video.id, 'failed', undefined, `Render failed: ${error}`);
            });
          } else if (project.status === 'failed') {
            // Video generation failed
            if (!checkedVideos.current.has(uniqueKey)) {
              console.log('[VideoPolling] Video failed:', video.id);
              updateVideoStatus(video.id, 'failed', undefined, project.error);
              checkedVideos.current.add(uniqueKey);
              
              // Send failure notification
              sendVideoFailedNotification(project.prompt || 'Your video');
            }
          } else if (project.status === 'processing' || project.status === 'rendering') {
            // Update to processing if it was pending
            if (video.status === 'pending') {
              console.log('[VideoPolling] Video processing:', video.id);
              updateVideoStatus(video.id, 'processing');
            }
          }
        } catch (error) {
          console.error('[VideoPolling] Error checking project:', video.projectId, error);
        }
      }
    };

    // Poll immediately
    pollVideos();

    // Then poll every 3 seconds
    if (!pollingInterval.current) {
      pollingInterval.current = setInterval(pollVideos, 3000);
    }

    // Cleanup interval on unmount or when dependencies change
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        pollingInterval.current = null;
      }
    };
  }, [videos, updateVideoStatus, convex, renderVideo]);
}

/**
 * Request notification permissions on app start
 */
export async function registerForPushNotificationsAsync() {
  let token;
  
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B35',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return;
  }

  console.log('Notification permissions granted');
  return finalStatus;
}

/**
 * Send a local notification when video is ready
 */
async function sendVideoReadyNotification(videoPrompt: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '✨ Your reel is ready!',
        body: `"${videoPrompt.substring(0, 50)}${videoPrompt.length > 50 ? '...' : ''}" has been generated`,
        data: { type: 'video_ready' },
        sound: true,
      },
      trigger: null, // Show immediately
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

/**
 * Send a local notification when video generation fails
 */
async function sendVideoFailedNotification(videoPrompt: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '❌ Video generation failed',
        body: `We couldn't generate "${videoPrompt.substring(0, 50)}${videoPrompt.length > 50 ? '...' : ''}"`,
        data: { type: 'video_failed' },
        sound: true,
      },
      trigger: null,
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

