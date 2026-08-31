import type { AccommodationKind } from "@stablemanager/shared";

export type DemoAccommodation = {
  name: string;
  kind: AccommodationKind;
  capacity: number | null;
};

/** Yard housing units for local/demo seed */
export const DEMO_ACCOMMODATIONS: DemoAccommodation[] = [
  { name: "Einsteller Stuten", kind: "paddock_box", capacity: 6 },
  { name: "Einsteller Wallache", kind: "paddock_box", capacity: 6 },
  { name: "Bullerbü", kind: "paddock_box", capacity: 4 },
  { name: "Stutenpaddock", kind: "paddock", capacity: 8 },
  { name: "Die Wallache", kind: "paddock", capacity: 8 },
  { name: "Weide am Wasser", kind: "pasture", capacity: 12 },
  { name: "Matzwitz", kind: "pasture", capacity: 15 },
  { name: "Todendorf", kind: "pasture", capacity: 15 },
  { name: "Pratjau", kind: "pasture", capacity: 20 },
];
