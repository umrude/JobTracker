import { describe, it, expect } from "vitest";
import { initials } from "@/components/company-avatar";

describe("initials", () => {
  it("takes the first letters of the first two words, ignoring punctuation", () => {
    expect(initials("Northwind Robotics")).toBe("NR");
    expect(initials("Fenwick & Vale")).toBe("FV");
    expect(initials("Affirm")).toBe("AF");
    expect(initials("")).toBe("?");
  });
});
