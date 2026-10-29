import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./alternates";
import { HOME_COPY } from "./home-copy";

describe("landing page translations", () => {
  it("provides complete landing content for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = HOME_COPY[locale];
      expect(copy.hero.title.trim()).not.toBe("");
      expect(copy.features.cards).toHaveLength(8);
      expect(copy.plans.baseFeatures).toHaveLength(5);
      expect(copy.plans.intermediateFeatures).toHaveLength(4);
      expect(copy.plans.expertFeatures).toHaveLength(4);
      expect(copy.contact.fields).toHaveLength(6);
      expect(copy.mocks.cleaning.dates).toHaveLength(3);
    }
  });
});
