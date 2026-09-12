import mascotImage from "../assets/mascot.png";

interface MascotProps {
  size?: number;
  className?: string;
}

export default function Mascot({ size = 96, className }: MascotProps) {
  return (
    <img
      src={mascotImage}
      alt="Tiji mascot"
      className={className}
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
    />
  );
}
