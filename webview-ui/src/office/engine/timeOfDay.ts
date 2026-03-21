// Time windows based on local system time
export const TimeWindow = {
  EarlyMorning: 'earlyMorning', // 6–8am
  Morning: 'morning', // 8–10am
  PeakWork: 'peakWork', // 10am–1pm
  Lunch: 'lunch', // 1–2pm
  Afternoon: 'afternoon', // 2–5pm
  LateAfternoon: 'lateAfternoon', // 5–7pm
  Evening: 'evening', // 7–10pm
  LateNight: 'lateNight', // 10pm–6am
  Weekend: 'weekend', // Sat/Sun (overrides hour-based)
} as const;

export type TimeWindow = (typeof TimeWindow)[keyof typeof TimeWindow];

export interface OverlayTint {
  /** CSS rgba string, e.g. 'rgba(255, 200, 100, 1)' */
  color: string;
  /** Max alpha multiplier 0–1. 0 = no tint. */
  peakOpacity: number;
}

/** Tint overlays per time window. Color is pre-defined; actual opacity lerped at runtime. */
export const TINT_TABLE: Record<TimeWindow, OverlayTint> = {
  earlyMorning: { color: 'rgba(255, 180, 80, 1)', peakOpacity: 0.07 },
  morning: { color: 'rgba(255, 200, 120, 1)', peakOpacity: 0.04 },
  peakWork: { color: 'rgba(0, 0, 0, 1)', peakOpacity: 0 },
  lunch: { color: 'rgba(255, 210, 140, 1)', peakOpacity: 0.05 },
  afternoon: { color: 'rgba(0, 0, 0, 1)', peakOpacity: 0 },
  lateAfternoon: { color: 'rgba(100, 120, 200, 1)', peakOpacity: 0.06 },
  evening: { color: 'rgba(30, 40, 120, 1)', peakOpacity: 0.1 },
  lateNight: { color: 'rgba(10, 15, 80, 1)', peakOpacity: 0.18 },
  weekend: { color: 'rgba(80, 40, 120, 1)', peakOpacity: 0.06 },
};

/**
 * Pure function — reads the local system time, returns the current window and weekend flag.
 * Weekend overrides hour-based windows for tint purposes.
 */
export function getTimeWindow(now: Date): { window: TimeWindow; isWeekend: boolean } {
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getHours();
  const isWeekend = day === 0 || day === 6;

  let window: TimeWindow;
  if (hour >= 6 && hour < 8) window = TimeWindow.EarlyMorning;
  else if (hour >= 8 && hour < 10) window = TimeWindow.Morning;
  else if (hour >= 10 && hour < 13) window = TimeWindow.PeakWork;
  else if (hour >= 13 && hour < 14) window = TimeWindow.Lunch;
  else if (hour >= 14 && hour < 17) window = TimeWindow.Afternoon;
  else if (hour >= 17 && hour < 19) window = TimeWindow.LateAfternoon;
  else if (hour >= 19 && hour < 22) window = TimeWindow.Evening;
  else window = TimeWindow.LateNight;

  return { window, isWeekend };
}
