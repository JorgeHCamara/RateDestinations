/** City rating dimensions. Kept free of server imports so client components can use them. */
export const CITY_DIMENSIONS = [
  "safety",
  "cleanliness",
  "food",
  "sights",
  "nature",
  "nightlife",
  "transport",
  "value",
  "friendliness",
] as const;
export type CityDimension = (typeof CITY_DIMENSIONS)[number];

/**
 * label: the name shown everywhere. description: what the dimension covers, shown in the "i"
 * tooltip next to the name (on the city page's scores and in the rating form). Written for locals
 * and visitors alike.
 */
export const DIMENSION_META: Record<
  CityDimension,
  { label: string; description: string; negative: boolean }
> = {
  safety: {
    label: "Safety",
    description:
      "How safe is it, day and night? Think crime, pickpocketing, scams and areas you'd avoid.",
    negative: true,
  },
  cleanliness: {
    label: "Cleanliness",
    description:
      "Streets, parks, public spaces: clean or dirty? Think litter, smells, graffiti and upkeep.",
    negative: true,
  },
  food: {
    label: "Food",
    description:
      "How good is the food overall? From street food and markets to cafés and restaurants.",
    negative: false,
  },
  sights: {
    label: "Sights",
    description:
      "Are the landmarks and culture worth it? Museums, monuments, architecture, neighbourhoods.",
    negative: false,
  },
  nature: {
    label: "Nature",
    description: "Parks, beaches, green space? How easy it is to get some fresh air and nature.",
    negative: false,
  },
  nightlife: {
    label: "Nightlife",
    description: "Bars, clubs, things to do late? Live music, events and how lively evenings are.",
    negative: false,
  },
  transport: {
    label: "Getting around",
    description:
      "Public transport, walking, traffic? How easy it is to get from place to place, with or without a car.",
    negative: false,
  },
  value: {
    label: "Value",
    description:
      "Do prices match what you get? Food, drinks, transport, attractions and places to stay.",
    negative: false,
  },
  friendliness: {
    label: "Friendliness",
    description:
      "How friendly and welcoming are people? To newcomers and to each other, in shops and on the street.",
    negative: false,
  },
};
