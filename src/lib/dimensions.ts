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

export const DIMENSION_META: Record<
  CityDimension,
  { label: string; question: string; negative: boolean }
> = {
  safety: { label: "Safety", question: "How safe did you feel, day and night?", negative: true },
  cleanliness: {
    label: "Cleanliness",
    question: "Streets, parks, public spaces: clean or dirty?",
    negative: true,
  },
  food: { label: "Food", question: "How good was the food overall?", negative: false },
  sights: {
    label: "Sights",
    question: "Were the landmarks and culture worth it?",
    negative: false,
  },
  nature: { label: "Nature", question: "Parks, beaches, green space?", negative: false },
  nightlife: { label: "Nightlife", question: "Bars, clubs, things to do late?", negative: false },
  transport: {
    label: "Getting around",
    question: "Public transport, walking, traffic?",
    negative: false,
  },
  value: { label: "Value", question: "Did prices match what you got?", negative: false },
  friendliness: {
    label: "Friendliness",
    question: "How were you treated as a visitor?",
    negative: false,
  },
};
