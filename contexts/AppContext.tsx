import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserProfile, Video, ConvexId } from '@/types';

const USER_KEY = '@reelfull_user';
const USER_ID_KEY = '@reelfull_userId';
const VIDEOS_KEY = '@reelfull_videos';

export const [AppProvider, useApp] = createContextHook(() => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userId, setUserId] = useState<ConvexId<"users"> | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userData, userIdData, videosData] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(USER_ID_KEY),
        AsyncStorage.getItem(VIDEOS_KEY),
      ]);

      if (userData) {
        try {
          setUser(JSON.parse(userData));
        } catch (e) {
          console.error('Error parsing user data:', e);
          await AsyncStorage.removeItem(USER_KEY);
        }
      }
      
      if (userIdData) {
        try {
          setUserId(userIdData as ConvexId<"users">);
        } catch (e) {
          console.error('Error parsing userId:', e);
          await AsyncStorage.removeItem(USER_ID_KEY);
        }
      }
      
      if (videosData) {
        try {
          const parsed = JSON.parse(videosData);
          setVideos(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          console.error('Error parsing videos data:', e);
          await AsyncStorage.removeItem(VIDEOS_KEY);
          setVideos([]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveUser = useCallback(async (profile: UserProfile) => {
    try {
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(profile));
      setUser(profile);
    } catch (error) {
      console.error('Error saving user:', error);
    }
  }, []);

  const addVideo = useCallback(async (video: Video) => {
    try {
      console.log('Adding video to storage:', video);
      
      setVideos((prevVideos) => {
        // Check if video already exists and update it
        const existingIndex = prevVideos.findIndex(v => v.id === video.id);
        let updatedVideos;
        
        if (existingIndex !== -1) {
          // Update existing video
          updatedVideos = [...prevVideos];
          updatedVideos[existingIndex] = video;
          console.log('Updated existing video:', video.id);
        } else {
          // Add new video
          updatedVideos = [video, ...prevVideos];
          console.log('Added new video:', video.id);
        }
        
        AsyncStorage.setItem(VIDEOS_KEY, JSON.stringify(updatedVideos)).catch((err) => {
          console.error('Error saving videos to storage:', err);
        });
        return updatedVideos;
      });
      
      console.log('Video operation successful');
    } catch (error) {
      console.error('Error adding video:', error);
    }
  }, []);

  const updateVideoStatus = useCallback(async (videoId: string, status: Video['status'], uri?: string, error?: string) => {
    try {
      setVideos((prevVideos) => {
        const updatedVideos = prevVideos.map(video => {
          if (video.id === videoId) {
            return {
              ...video,
              status,
              ...(uri && { uri }),
              ...(error && { error }),
            };
          }
          return video;
        });
        
        AsyncStorage.setItem(VIDEOS_KEY, JSON.stringify(updatedVideos)).catch((err) => {
          console.error('Error saving videos to storage:', err);
        });
        return updatedVideos;
      });
    } catch (error) {
      console.error('Error updating video status:', error);
    }
  }, []);

  const deleteVideo = useCallback(async (videoId: string) => {
    try {
      setVideos((prevVideos) => {
        const updatedVideos = prevVideos.filter(video => video.id !== videoId);
        AsyncStorage.setItem(VIDEOS_KEY, JSON.stringify(updatedVideos)).catch((err) => {
          console.error('Error saving videos to storage:', err);
        });
        return updatedVideos;
      });
    } catch (error) {
      console.error('Error deleting video:', error);
    }
  }, []);

  const saveUserId = useCallback(async (id: ConvexId<"users">) => {
    try {
      await AsyncStorage.setItem(USER_ID_KEY, id);
      setUserId(id);
    } catch (error) {
      console.error('Error saving userId:', error);
    }
  }, []);

  const clearData = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([USER_KEY, USER_ID_KEY, VIDEOS_KEY]);
      setUser(null);
      setUserId(null);
      setVideos([]);
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }, []);

  return useMemo(() => ({
    user,
    userId,
    videos,
    isLoading,
    saveUser,
    saveUserId,
    addVideo,
    updateVideoStatus,
    deleteVideo,
    clearData,
  }), [user, userId, videos, isLoading, saveUser, saveUserId, addVideo, updateVideoStatus, deleteVideo, clearData]);
});
