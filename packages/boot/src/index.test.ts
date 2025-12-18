import { describe, expect, test } from "bun:test";
import boot from "./index";

describe("boot", () => {
  test("returns an Astro integration", () => {
    const integration = boot();

    expect(integration.name).toBe("@astroscope/boot");
    expect(integration.hooks).toBeDefined();
    expect(integration.hooks["astro:config:setup"]).toBeFunction();
  });

  test("accepts custom entry option", () => {
    const integration = boot({ entry: "src/custom-boot.ts" });

    expect(integration.name).toBe("@astroscope/boot");
  });
});
