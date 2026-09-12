import { useEffect } from "react";
import Mascot from "../components/Mascot";
import "./SplashScreen.css";

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  // Intentionally run once on mount only. App.tsx passes a fresh `onDone`
  // function identity on every render (e.g. whenever gesture-socket state
  // changes), and depending on it would clear + restart this timer on every
  // one of those re-renders - which happen more often than 1.5s once the
  // WebSocket is streaming - so the splash screen would never advance.
  useEffect(() => {
    const timer = setTimeout(onDone, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen splash-screen">
      <Mascot size={140} />
      <h1 className="splash-title">tiji</h1>
    </div>
  );
}
