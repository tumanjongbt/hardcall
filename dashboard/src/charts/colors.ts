import type { Channel } from "../channels";

export const NEBULA = "#5b2cff";
export const CORONA = "#ffb020";
export const SIGNAL = "#2ee6a6";
export const PAPER = "#f5f2ea";
export const PAPER_DIM = "rgba(245, 242, 234, 0.72)";
export const LINE = "rgba(245, 242, 234, 0.14)";
export const HUMAN = "#7ce0c3";
export const RISK = "#ad6e8f";

/** Hardcall celestial tokens mapped to the five event channels. */
export const CHANNEL_COLORS: Record<Channel, string> = {
  university: NEBULA,
  community_college: "#987bf6",
  trade: CORONA,
  apprenticeship: SIGNAL,
  automation: RISK,
};

export const STAKEHOLDER_COLORS: Record<string, string> = {
  high_school_students: SIGNAL,
  college_students: NEBULA,
  parents: CORONA,
  career_counselors: "#987bf6",
  workforce_training_managers: RISK,
};

export function hexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const n = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  if ([r, g, b].some((part) => Number.isNaN(part))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
