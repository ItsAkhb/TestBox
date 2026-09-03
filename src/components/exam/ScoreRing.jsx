import { motion } from "framer-motion";
import CountUp from "../ui/CountUp";

export default function ScoreRing({ percentage = 0, grade = "", size = 148, stroke = 12 }) {
  const pct = Math.min(Math.max(Number(percentage) || 0, 0), 100);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference * (1 - pct / 100);

  return (
    <div
      className="score-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="score-ring-track"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="score-ring-fill"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: targetOffset }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring-center">
        <motion.span
          className="score-ring-pct num"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <CountUp value={pct} decimals={1} suffix="%" duration={1100} />
        </motion.span>
        {grade && (
          <motion.span
            className="results-grade"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.75 }}
          >
            {grade}
          </motion.span>
        )}
      </div>
    </div>
  );
}
