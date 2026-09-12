import mascotImage from "../assets/mascot.png";

interface MascotProps {
  size?: number;
  className?: string;
  onAnimationEnd?: () => void;
}

export default function Mascot({ size, className, onAnimationEnd }: MascotProps) {
  return (
    <img
      src={mascotImage}
      alt="tiji mascot"
      className={className}
      onAnimationEnd={onAnimationEnd}
      {...(size ? { width: size, height: size, style: { objectFit: "contain" as const } } : {})}
    />
  );
}
