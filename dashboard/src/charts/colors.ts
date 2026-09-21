import type { Channel } from "../channels";

export const NEBULA = "#5b2cff";
export const CORONA = "#ffb020";
export const SIGNAL = "#2ee6a6";
export const PAPER = "#f5f2ea";
export const PAPER_DIM = "rgba(245, 242, 234, 0.72)";
export const LINE = "rgba(245, 242, 234, 0.14)";

/** Hardcall celestial tokens mapped to the five event channels. */
export const CHANNEL_COLORS: Record<Channel, string> = {
  university: NEBULA,
  community_college: "#987bf6",
  trade: CORONA,
  apprenticeship: SIGNAL,
  automation: "#ad6e8f",
};
