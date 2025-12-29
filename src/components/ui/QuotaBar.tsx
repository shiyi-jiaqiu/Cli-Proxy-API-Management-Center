import { useMemo, useState, useEffect, useRef } from 'react';
import styles from './QuotaBar.module.scss';

type QuotaLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface QuotaBarProps {
  label: string;
  percent?: number | null; // 0-100 remaining
  resetSeconds?: number | null;
  resetTime?: string | null; // RFC3339/ISO timestamp
}

// Refresh interval for countdown updates (60 seconds)
const COUNTDOWN_REFRESH_INTERVAL = 60_000;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function computeLevel(percent?: number | null): QuotaLevel {
  if (percent == null || !Number.isFinite(percent)) return 'unknown';
  if (percent > 60) return 'high';
  if (percent > 30) return 'medium';
  return 'low';
}

function formatRemainingSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function secondsUntilResetTime(resetTime: string): number | null {
  const ms = Date.parse(resetTime);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((ms - Date.now()) / 1000));
}

export function QuotaBar({ label, percent, resetSeconds, resetTime }: QuotaBarProps) {
  const normalizedPercent = useMemo(() => {
    if (percent == null) return null;
    return clampPercent(percent);
  }, [percent]);

  const level = useMemo(() => computeLevel(normalizedPercent), [normalizedPercent]);

  // Tick state to trigger countdown refresh every minute
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only start interval if we have resetTime (dynamic countdown)
    // resetSeconds is a snapshot and doesn't need live updates
    if (!resetTime) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, COUNTDOWN_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [resetTime]);

  const resetLabel = useMemo(() => {
    if (resetSeconds != null && Number.isFinite(resetSeconds)) {
      return `R: ${formatRemainingSeconds(resetSeconds)}`;
    }
    if (resetTime) {
      const seconds = secondsUntilResetTime(resetTime);
      if (seconds != null) {
        return `R: ${formatRemainingSeconds(seconds)}`;
      }
    }
    return '';
    // Include tick to force re-computation when countdown updates
  }, [resetSeconds, resetTime, tick]);

  return (
    <div className={styles.container}>
      <span className={styles.label} title={label}>
        {label}
      </span>
      <div className={styles.track} aria-label={`${label} quota`}>
        <div
          className={`${styles.fill} ${styles[level]}`}
          data-testid="quota-fill"
          data-level={level}
          style={{ width: `${normalizedPercent ?? 0}%` }}
        />
      </div>
      <span className={styles.percent}>{normalizedPercent == null ? '--' : `${normalizedPercent}%`}</span>
      {resetLabel ? <span className={styles.reset}>{resetLabel}</span> : null}
    </div>
  );
}

