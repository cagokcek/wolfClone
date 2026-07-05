import { useEffect, useRef } from "react";

interface Props {
  hp: number;
}

export default function FaceHUD({ hp }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const W = 64, H = 64;
    c.width = W;
    c.height = H;
    ctx.imageSmoothingEnabled = false;

    // Background panel
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(2, 2, W - 4, H - 4);

    const dead = hp <= 0;
    // 0..4 severity: 0 = healthy, 4 = near death
    const sev = dead ? 5 : Math.min(4, Math.floor((100 - hp) / 20));

    // --- Brodie helmet ---
    ctx.fillStyle = "#3e4632";
    // brim
    ctx.fillRect(14, 16, 36, 4);
    // dome
    ctx.beginPath();
    ctx.ellipse(32, 16, 14, 8, 0, Math.PI, 0);
    ctx.fill();
    // helmet highlight
    ctx.fillStyle = "#525c40";
    ctx.fillRect(20, 11, 10, 2);

    // --- Face ---
    const faceColor = dead ? "#7a6b5a" : "#c8a07a";
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.ellipse(32, 36, 14, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // shadow under helmet brim
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(18, 20, 28, 3);

    // --- Eyes ---
    ctx.fillStyle = "#fff";
    if (dead) {
      // X eyes
      ctx.strokeStyle = "#3a1a10";
      ctx.lineWidth = 2;
      const drawX = (cx: number, cy: number) => {
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3);
        ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3);
        ctx.stroke();
      };
      drawX(26, 30);
      drawX(38, 30);
    } else {
      // eye whites
      ctx.fillRect(23, 28, 7, 4);
      ctx.fillRect(34, 28, 7, 4);
      // pupils, slightly narrowed as severity increases
      ctx.fillStyle = "#1a1a1a";
      const pupilW = sev >= 3 ? 2 : 2;
      const pupilH = sev >= 3 ? 2 : 3;
      const pupilOffX = sev >= 2 ? 1 : 0; // furrowed inward
      ctx.fillRect(25 + pupilOffX, 29, pupilW, pupilH);
      ctx.fillRect(36 + pupilOffX, 29, pupilW, pupilH);
      // angry brows that lower with severity
      ctx.fillStyle = "#2a1810";
      const browY = 24 + Math.min(3, sev);
      // left brow: tilt inward more with severity
      ctx.beginPath();
      ctx.moveTo(22, browY + (sev >= 2 ? -1 : 1));
      ctx.lineTo(31, browY + sev);
      ctx.lineTo(31, browY + sev + 2);
      ctx.lineTo(22, browY + (sev >= 2 ? 1 : 3));
      ctx.closePath();
      ctx.fill();
      // right brow mirror
      ctx.beginPath();
      ctx.moveTo(42, browY + (sev >= 2 ? -1 : 1));
      ctx.lineTo(33, browY + sev);
      ctx.lineTo(33, browY + sev + 2);
      ctx.lineTo(42, browY + (sev >= 2 ? 1 : 3));
      ctx.closePath();
      ctx.fill();
    }

    // --- Mouth ---
    if (!dead) {
      ctx.fillStyle = "#3a1a14";
      if (sev <= 0) {
        // calm closed line
        ctx.fillRect(28, 42, 8, 1);
      } else if (sev === 1) {
        // slight frown
        ctx.fillRect(27, 43, 10, 1);
        ctx.fillRect(27, 42, 1, 1);
        ctx.fillRect(36, 42, 1, 1);
      } else if (sev === 2) {
        // open grimace small
        ctx.fillRect(27, 41, 10, 3);
        ctx.fillStyle = "#fff";
        // teeth
        ctx.fillRect(28, 42, 1, 1);
        ctx.fillRect(30, 42, 1, 1);
        ctx.fillRect(32, 42, 1, 1);
        ctx.fillRect(34, 42, 1, 1);
        ctx.fillRect(36, 42, 1, 1);
      } else {
        // bared-teeth grimace
        ctx.fillRect(25, 40, 14, 5);
        ctx.fillStyle = "#fff";
        for (let i = 0; i < 7; i++) {
          ctx.fillRect(26 + i * 2, 41, 1, 3);
        }
      }
    } else {
      // dead mouth
      ctx.fillStyle = "#3a1a14";
      ctx.fillRect(27, 43, 10, 2);
    }

    // --- Blood at severity 2+ ---
    if (sev >= 2 && !dead) {
      ctx.fillStyle = "#a01010";
      // gash above eye
      ctx.fillRect(40, 24, 5, 1);
      ctx.fillRect(41, 25, 3, 1);
      // dribble
      ctx.fillRect(42, 26, 1, 2);
    }
    if (sev >= 3) {
      ctx.fillStyle = "#8a0a0a";
      // cheek blood
      ctx.fillRect(22, 36, 4, 1);
      ctx.fillRect(23, 37, 5, 2);
      ctx.fillRect(24, 39, 4, 2);
      // forehead trickle
      ctx.fillStyle = "#a01010";
      ctx.fillRect(30, 22, 2, 6);
      ctx.fillRect(32, 25, 1, 4);
    }
    if (sev >= 4) {
      ctx.fillStyle = "#a01010";
      ctx.fillRect(36, 36, 6, 2);
      ctx.fillRect(37, 38, 5, 2);
      ctx.fillRect(38, 40, 3, 1);
      // blood from mouth
      ctx.fillRect(30, 45, 4, 2);
      ctx.fillRect(31, 47, 2, 2);
    }
    if (dead) {
      ctx.fillStyle = "#7a0808";
      ctx.fillRect(20, 38, 24, 3);
      ctx.fillRect(22, 41, 20, 2);
      ctx.fillRect(26, 43, 12, 3);
      ctx.fillRect(28, 46, 8, 2);
    }
  }, [hp]);

  return (
    <canvas
      ref={ref}
      aria-label={`Soldier portrait at ${hp} HP`}
      className="border border-red-900 bg-black"
      style={{ width: 72, height: 72, imageRendering: "pixelated" }}
    />
  );
}
