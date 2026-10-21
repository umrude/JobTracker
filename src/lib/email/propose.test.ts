import { describe, it, expect } from "vitest";
import { proposeForSavedJob, proposeStatus } from "@/lib/email/propose";

describe("proposeStatus", () => {
  it("moves an application forward", () => {
    expect(proposeStatus("acknowledged", "applied")).toBe("acknowledged");
    expect(proposeStatus("interview", "acknowledged")).toBe("interviewing");
    expect(proposeStatus("assessment", "applied")).toBe("interviewing");
    expect(proposeStatus("offer", "interviewing")).toBe("offer");
    expect(proposeStatus("rejection", "interviewing")).toBe("rejected");
  });

  it("never moves backwards or to where it already is", () => {
    expect(proposeStatus("acknowledged", "interviewing")).toBeNull();
    expect(proposeStatus("interview", "offer")).toBeNull();
    expect(proposeStatus("offer", "offer")).toBeNull();
    expect(proposeStatus("rejection", "rejected")).toBeNull();
    expect(proposeStatus("interview", "interviewing")).toBeNull();
  });

  it("revives a ghosted application, and allows a rescinded offer", () => {
    expect(proposeStatus("interview", "ghosted")).toBe("interviewing");
    expect(proposeStatus("rejection", "offer")).toBe("rejected");
  });

  it("suggests nothing without a type, an application, or relevance", () => {
    expect(proposeStatus("not_relevant", "applied")).toBeNull();
    expect(proposeStatus(null, "applied")).toBeNull();
    expect(proposeStatus("offer", null)).toBeNull();
  });
});

describe("proposeForSavedJob", () => {
  it("adds a saved job to the board at the status the email implies", () => {
    expect(proposeForSavedJob("acknowledged")).toBe("acknowledged");
    expect(proposeForSavedJob("assessment")).toBe("interviewing");
    expect(proposeForSavedJob("rejection")).toBe("rejected");
    expect(proposeForSavedJob("not_relevant")).toBeNull();
    expect(proposeForSavedJob(null)).toBeNull();
  });
});
