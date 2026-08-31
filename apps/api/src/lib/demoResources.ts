import type { ResourceKind } from "@stablemanager/shared";

export type DemoResource = {
  name: string;
  kind: ResourceKind;
};

/** Booking resources mirrored from local demo DB */
export const DEMO_RESOURCES: DemoResource[] = [
  { name: "Ovalbahn", kind: "oval_track" },
  { name: "Reithalle", kind: "indoor_arena" },
];
