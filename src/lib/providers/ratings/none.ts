import type { ExternalRatingProvider } from "./index";

export const noneProvider: ExternalRatingProvider = {
  name: "none",
  maxCacheDays: 365,
  isEnabled: () => true,
  lookup: async () => null,
};
