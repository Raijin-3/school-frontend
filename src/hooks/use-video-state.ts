"use client";

import { useCallback, useRef, useState } from "react";

interface VideoState {
  currentTime: number;
  isPlaying: boolean;
  duration: number;
}

export function useVideoState() {
  const [videoState, setVideoState] = useState<VideoState>({
    currentTime: 0,
    isPlaying: false,
    duration: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const updateCurrentTime = useCallback((time: number) => {
    setVideoState(prev => {
      if (Math.abs(prev.currentTime - time) < 0.01) {
        return prev;
      }
      return { ...prev, currentTime: time };
    });
  }, []);

  const updatePlayState = useCallback((playing: boolean) => {
    setVideoState(prev => {
      if (prev.isPlaying === playing) {
        return prev;
      }
      return { ...prev, isPlaying: playing };
    });
  }, []);

  const updateDuration = useCallback((duration: number) => {
    setVideoState(prev => {
      if (Math.abs(prev.duration - duration) < 0.01) {
        return prev;
      }
      return { ...prev, duration };
    });
  }, []);

  const setVideoRef = useCallback((ref: HTMLVideoElement | null) => {
    videoRef.current = ref;
  }, []);

  const syncVideoTime = useCallback((targetTime: number) => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - targetTime) > 1) {
      videoRef.current.currentTime = targetTime;
    }
  }, []);

  const syncPlayState = useCallback((shouldPlay: boolean) => {
    if (!videoRef.current) return;

    if (shouldPlay && videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    } else if (!shouldPlay && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, []);

  return {
    videoState,
    updateCurrentTime,
    updatePlayState,
    updateDuration,
    setVideoRef,
    syncVideoTime,
    syncPlayState,
  };
}
