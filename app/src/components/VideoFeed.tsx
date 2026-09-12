import { useEffect, useState } from "react";
import "./VideoFeed.css";

const VIDEO_FEED_URL = "http://localhost:8766/video_feed";
const VIDEO_RETRY_DELAY_MS = 3000;

interface VideoFeedProps {
  children?: React.ReactNode; // overlay content (e.g. a gesture toast), positioned above the feed
}

// Python owns the webcam; this just renders the annotated MJPEG stream it
// publishes. Ported from the original App.tsx, including the retry fix:
// once the <img> errors out, we flip videoOk back to true before bumping the
// key so it actually remounts and retries, instead of getting stuck showing
// the placeholder forever.
export default function VideoFeed({ children }: VideoFeedProps) {
  const [videoOk, setVideoOk] = useState(true);
  const [videoAttempt, setVideoAttempt] = useState(0);

  useEffect(() => {
    if (videoOk) return;
    const timer = setTimeout(() => {
      setVideoAttempt((n) => n + 1);
      setVideoOk(true);
    }, VIDEO_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [videoOk]);

  return (
    <div className="video-box">
      {videoOk ? (
        <img
          key={videoAttempt}
          className="video-feed"
          src={`${VIDEO_FEED_URL}?attempt=${videoAttempt}`}
          alt="Live camera feed"
          onError={() => setVideoOk(false)}
          onLoad={() => setVideoOk(true)}
        />
      ) : (
        <div className="video-placeholder">CAMERA FEED UNAVAILABLE</div>
      )}
      {children}
    </div>
  );
}
