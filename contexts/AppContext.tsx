import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserProfile, Video } from '@/types';

const USER_KEY = '@reelfull_user';
const VIDEOS_KEY = '@reelfull_videos';

export const [AppProvider, useApp] = createContextHook(() => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userData, videosData] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
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
      if (!video.uri || video.uri.length === 0) {
        console.error('Cannot add video with empty URI');
        return;
      }
      
      setVideos((prevVideos) => {
        const updatedVideos = [video, ...prevVideos];
        AsyncStorage.setItem(VIDEOS_KEY, JSON.stringify(updatedVideos)).catch((err) => {
          console.error('Error saving videos to storage:', err);
        });
        return updatedVideos;
      });
      
      console.log('Video added successfully');
    } catch (error) {
      console.error('Error adding video:', error);
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

  const clearData = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([USER_KEY, VIDEOS_KEY]);
      setUser(null);
      setVideos([]);
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }, []);

  return useMemo(() => ({
    user,
    videos,
    isLoading,
    saveUser,
    addVideo,
    deleteVideo,
    clearData,
  }), [user, videos, isLoading, saveUser, addVideo, deleteVideo, clearData]);
});
