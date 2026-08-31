import type { HorseSex } from "@stablemanager/shared";

export type DemoHorse = {
  name: string;
  feifId: string;
  sex: HorseSex;
  birthYear: number;
};

/** Sample sale horses for local/demo bootstrap (no notes) */
export const DEMO_HORSES: DemoHorse[] = [
  {
    name: "Andrá von Kjölavík",
    feifId: "DE2017222618",
    sex: "mare",
    birthYear: 2017,
  },
  {
    name: "Snöggur fra Rødstenskær",
    feifId: "DK2020100185",
    sex: "gelding",
    birthYear: 2020,
  },
  {
    name: "Stapi fra Kirkjubæ",
    feifId: "IS2009186101",
    sex: "gelding",
    birthYear: 2009,
  },
  {
    name: "Fríða fra Bakkegården",
    feifId: "DK2019200601",
    sex: "mare",
    birthYear: 2019,
  },
  {
    name: "Elías fra Rendborg",
    feifId: "DK2017100028",
    sex: "gelding",
    birthYear: 2017,
  },
  {
    name: "Vísa von Faxaból",
    feifId: "DE2018256359",
    sex: "mare",
    birthYear: 2018,
  },
  {
    name: "Ljúfur von der Norderheide",
    feifId: "DE2021110697",
    sex: "gelding",
    birthYear: 2021,
  },
];
