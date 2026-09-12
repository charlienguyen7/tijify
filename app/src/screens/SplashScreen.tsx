import { useEffect } from "react";
import Mascot from "../components/Mascot";
import "./SplashScreen.css";

// Must match the 50% keyframe offset in SplashScreen.css (pop, hold, and
// drop finish at 1800ms of the 3.6s animation; rocket-launch runs 1800-3600ms)
// so the home screen starts its drape reveal exactly as the mascot launches.
const LAUNCH_DELAY_MS = 1800;

interface SplashScreenProps {
  launching: boolean;
  onLaunch: () => void;
  onDone: () => void;
}

export default function SplashScreen({ launching, onLaunch, onDone }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onLaunch, LAUNCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`splash-overlay${launching ? " launching" : ""}`}>
      <Mascot className="splash-mascot" onAnimationEnd={onDone} />
    </div>
  );
}
