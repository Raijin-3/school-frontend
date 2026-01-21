"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    playerjs?: any;
  }
}

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  onTimeUpdate?: (time: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onDurationChange?: (duration: number) => void;
  onVideoRef?: (ref: HTMLVideoElement | null) => void;
  currentTime?: number;
  shouldPlay?: boolean;
  disableNativeFullscreen?: boolean;
  onReadyToPlay?: () => void;
}

export function VideoPlayer({
  src,
  poster,
  className = "",
  onTimeUpdate,
  onPlayStateChange,
  onDurationChange,
  onVideoRef,
  currentTime,
  shouldPlay,
  disableNativeFullscreen = false,
  onReadyToPlay,
}: VideoPlayerProps) {
  const normalizedSrc = useMemo(() => {
    if (!src) return src;
    try {
      const url = new URL(src);
      if (/mediadelivery\.net/i.test(url.hostname)) {
        const segments = url.pathname.split("/").filter(Boolean);
        if (segments[0] === "play" && segments.length >= 3) {
          url.pathname = `/embed/${segments[1]}/${segments[2]}`;
          return url.toString();
        }
      }
    } catch {
      // fall through to original src when URL parsing fails
    }
    return src;
  }, [src]);

  const effectiveSrc = normalizedSrc;
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<any>(null);
  const [playerJsReady, setPlayerJsReady] = useState(false);
  const isIframe = /mediadelivery\.net|youtube\.com|youtu\.be|vimeo\.com/i.test(effectiveSrc || "");
  const isBunnyStream = /mediadelivery\.net/i.test(effectiveSrc || "");
  const cls = `w-full h-full ${className}`.trim();
  const bunnyVideoId = useMemo(() => {
    if (!isBunnyStream) return undefined;
    if (!effectiveSrc) return undefined;
    const match = effectiveSrc.match(/\/embed\/[^/]+\/([^/?&]+)/i);
    return match?.[1];
  }, [effectiveSrc, isBunnyStream]);
  const bunnyIframeId = useMemo(() => {
    if (!isBunnyStream) return undefined;
    return bunnyVideoId ? `bunny-stream-embed-${bunnyVideoId}` : "bunny-stream-embed";
  }, [isBunnyStream, bunnyVideoId]);
  const firstFrameCapturedRef = useRef(false);
  useEffect(() => {
    firstFrameCapturedRef.current = false;
  }, [effectiveSrc]);

  const notifyReadyToPlay = useCallback(() => {
    if (!firstFrameCapturedRef.current) {
      firstFrameCapturedRef.current = true;
      onReadyToPlay?.();
    }
  }, [onReadyToPlay]);

  // Set up video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isIframe) return;

    const handleTimeUpdate = () => {
      onTimeUpdate?.(video.currentTime);
      notifyReadyToPlay();
    };

    const handlePlay = () => {
      onPlayStateChange?.(true);
    };

    const handlePause = () => {
      onPlayStateChange?.(false);
    };

    const handleLoadedMetadata = () => {
      onDurationChange?.(video.duration);
    };

    const handleLoadedData = () => {
      notifyReadyToPlay();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('loadeddata', handleLoadedData);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [onTimeUpdate, onPlayStateChange, onDurationChange, isIframe, notifyReadyToPlay]);

  // Provide video ref to parent
  useEffect(() => {
    onVideoRef?.(videoRef.current);
  }, [onVideoRef]);

  // Sync external state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isIframe) return;

    if (typeof currentTime === 'number' && Math.abs(video.currentTime - currentTime) > 1) {
      video.currentTime = currentTime;
    }
  }, [currentTime, isIframe]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isIframe || typeof shouldPlay !== "boolean") return;
    if (shouldPlay && video.paused) {
      video.play().catch(() => {});
    } else if (!shouldPlay && !video.paused) {
      video.pause();
    }
  }, [shouldPlay, isIframe]);

  // Listen for Bunny Stream iframe events to surface progress/duration/playback
  useEffect(() => {
    if (!isBunnyStream) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin) {
        try {
          const originHost = new URL(event.origin).hostname;
          if (!originHost.endsWith("mediadelivery.net")) {
            return;
          }
        } catch {
          return;
        }
      }
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if ((data as any).channel !== "bunnystream") return;
      if (bunnyVideoId && (data as any).video && (data as any).video !== bunnyVideoId) return;
      const status = (data as any).status || {};
      const durationValue = typeof status.duration === "number" ? status.duration : undefined;
      const currentValue = typeof status.currentTime === "number" ? status.currentTime : undefined;
      if (typeof durationValue === "number" && durationValue > 0) {
        onDurationChange?.(durationValue);
      }
      if (typeof currentValue === "number" && currentValue >= 0) {
        onTimeUpdate?.(currentValue);
      }
      if (typeof status.playing === "boolean") {
        onPlayStateChange?.(status.playing);
      } else if (typeof status.paused === "boolean") {
        onPlayStateChange?.(!status.paused);
      }
      notifyReadyToPlay();
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isBunnyStream, bunnyVideoId, onDurationChange, onPlayStateChange, onTimeUpdate]);

  const postBunnyCommand = useCallback(
    (command: string) => {
      if (!isBunnyStream) return;
      const iframe = iframeRef.current;
      if (!iframe) return;
      iframe.contentWindow?.postMessage({ command }, "*");
    },
    [isBunnyStream],
  );

  useEffect(() => {
    if (!isBunnyStream) return;
    if (window.playerjs) {
      console.log("[video-player] playerjs already loaded");
      setPlayerJsReady(true);
      return;
    }
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-playerjs="bunny-stream"]',
    );
    if (existingScript) {
      const handleLoad = () => {
        console.log("[video-player] playerjs script loaded (existing tag)");
        setPlayerJsReady(true);
      };
      existingScript.addEventListener("load", handleLoad);
      return () => {
        existingScript.removeEventListener("load", handleLoad);
      };
    }
    const script = document.createElement("script");
    script.src = "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js";
    script.async = true;
    script.dataset.playerjs = "bunny-stream";
    script.addEventListener("load", () => {
      console.log("[video-player] playerjs script loaded");
      setPlayerJsReady(true);
    });
    document.body.appendChild(script);
    return () => {
      // Keep the script cached for subsequent embeds.
    };
  }, [isBunnyStream]);

  useEffect(() => {
    if (!isBunnyStream) return;
    const timer = window.setTimeout(() => {
      postBunnyCommand("activate");
    }, 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isBunnyStream, postBunnyCommand, effectiveSrc]);

  useEffect(() => {
    if (!isBunnyStream || !playerJsReady || !bunnyIframeId || !iframeRef.current) {
      return;
    }
    if (!window.playerjs?.Player) {
      return;
    }

    console.log("[video-player] creating playerjs instance", {
      bunnyIframeId,
    });
    const player = new window.playerjs.Player(bunnyIframeId);
    playerRef.current = player;

    const handleReady = () => {
      console.log("[video-player] playerjs ready");
      onReadyToPlay?.();
      player.getDuration?.((duration: number) => {
        console.log("[video-player] playerjs duration", { duration });
        if (typeof duration === "number" && duration > 0) {
          onDurationChange?.(duration);
        }
      });
    };

    const handleTimeUpdate = (timingData: { seconds?: number; duration?: number }) => {
      console.log("[video-player] playerjs timeupdate", timingData);
      if (typeof timingData?.seconds === "number") {
        onTimeUpdate?.(timingData.seconds);
      }
      if (typeof timingData?.duration === "number") {
        onDurationChange?.(timingData.duration);
      }
      notifyReadyToPlay();
    };

    const handlePlay = () => {
      console.log("[video-player] playerjs play");
      onPlayStateChange?.(true);
    };

    const handlePause = () => {
      console.log("[video-player] playerjs pause");
      onPlayStateChange?.(false);
    };

    player.on?.("ready", handleReady);
    player.on?.("timeupdate", handleTimeUpdate);
    player.on?.("play", handlePlay);
    player.on?.("pause", handlePause);

    const pollTimer = window.setInterval(() => {
      player.getCurrentTime?.((time: number) => {
        console.log("[video-player] playerjs poll currentTime", { time });
        if (typeof time === "number") {
          onTimeUpdate?.(time);
        }
      });
      player.getDuration?.((duration: number) => {
        console.log("[video-player] playerjs poll duration", { duration });
        if (typeof duration === "number" && duration > 0) {
          onDurationChange?.(duration);
        }
      });
    }, 5000);

    return () => {
      window.clearInterval(pollTimer);
      try {
        player.off?.("ready", handleReady);
        player.off?.("timeupdate", handleTimeUpdate);
        player.off?.("play", handlePlay);
        player.off?.("pause", handlePause);
      } catch {
        // ignore player cleanup errors
      }
      playerRef.current = null;
    };
  }, [
    isBunnyStream,
    playerJsReady,
    bunnyIframeId,
    onDurationChange,
    onPlayStateChange,
    onReadyToPlay,
    onTimeUpdate,
    notifyReadyToPlay,
  ]);

  const handleIframeLoad = useCallback(() => {
    postBunnyCommand("activate");
  }, [postBunnyCommand]);

  if (isIframe) {
    return (
      <iframe
        ref={iframeRef}
        id={bunnyIframeId}
        src={effectiveSrc}
        className={cls}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        onLoad={handleIframeLoad}
      />
    );
  }

  return (
    <video 
      ref={videoRef}
      src={effectiveSrc} 
      controls 
      controlsList={disableNativeFullscreen ? "nofullscreen" : undefined}
      playsInline 
      poster={poster} 
      className={cls} 
      data-disable-native-fullscreen={disableNativeFullscreen ? "true" : undefined}
    />
  );
}

