import { describe, it, expect } from "vitest";
import { scoreBand } from "@/lib/score-band";

describe("scoreBand", () => {
  it("maps each band's boundaries", () => {
    expect(scoreBand(100).label).toBe("Strong fit");
    expect(scoreBand(85).label).toBe("Strong fit");
    expect(scoreBand(84).label).toBe("Solid fit");
    expect(scoreBand(60).label).toBe("Solid fit");
    expect(scoreBand(59).label).toBe("Stretch");
    expect(scoreBand(40).label).toBe("Stretch");
    expect(scoreBand(39).label).toBe("Poor fit");
    expect(scoreBand(0).label).toBe("Poor fit");
  });
});
