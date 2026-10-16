import { describe, expect, it } from "vitest";
import {
  ANNADANAM_EXPIRES_AT,
  BANNER_EXPIRES_AT,
  announcementAt,
  announcementCheckDelay,
} from "@/lib/announcements";
describe("Bilingual festival announcement schedule", () => {
  it("shows both confirmed events in English and Telugu before Annadanam expires", () => {
    const message = announcementAt(Date.parse("2026-10-17T23:59:59.999+05:30"));
    expect(message!.id).toBe("combined");
    expect(message!.message.en).toContain("Saturday, 17 October 2026, at 12:00 noon IST");
    expect(message!.message.te).toContain("17 అక్టోబర్ 2026 మధ్యాహ్నం 12");
    expect(message!.message.en).toContain("18 October 2026, at 5:00 PM IST");
    expect(message!.message.te).toContain("18 అక్టోబర్ 2026 సాయంత్రం 5");
  });
  it("switches at exactly 18 October midnight IST, equivalent to 17 October 18:30 UTC", () => {
    expect(ANNADANAM_EXPIRES_AT).toBe(Date.parse("2026-10-17T18:30:00Z"));
    expect(announcementAt(ANNADANAM_EXPIRES_AT - 1)?.id).toBe("combined");
    const message = announcementAt(ANNADANAM_EXPIRES_AT);
    expect(message!.id).toBe("nimajjanam");
    expect(message!.message.en).toContain("Sunday, 18 October 2026, at 5:00 PM IST");
    expect(message!.message.te).toContain("18 అక్టోబర్ 2026 సాయంత్రం 5");
  });
  it("removes the whole banner at exactly midnight ending 18 October IST", () => {
    expect(BANNER_EXPIRES_AT).toBe(Date.parse("2026-10-18T18:30:00Z"));
    expect(announcementAt(BANNER_EXPIRES_AT - 1)?.id).toBe("nimajjanam");
    expect(announcementAt(BANNER_EXPIRES_AT)).toBeNull();
    expect(announcementAt(BANNER_EXPIRES_AT + 1)).toBeNull();
  });
  it("checks at the boundary without a minute's delay or a tight expired timer loop", () => {
    expect(announcementCheckDelay(ANNADANAM_EXPIRES_AT - 500)).toBe(500);
    expect(announcementCheckDelay(ANNADANAM_EXPIRES_AT - 120000)).toBe(60000);
    expect(announcementCheckDelay(ANNADANAM_EXPIRES_AT)).toBe(60000);
    expect(announcementCheckDelay(ANNADANAM_EXPIRES_AT + 1)).toBe(60000);
    expect(announcementCheckDelay(BANNER_EXPIRES_AT - 500)).toBe(500);
    expect(announcementCheckDelay(BANNER_EXPIRES_AT)).toBe(60000);
  });
});

it("keeps Nimajjanam through its 5 PM event and the rest of 18 October", () => {
  expect(announcementAt(Date.parse("2026-10-18T17:00:00+05:30"))?.id).toBe("nimajjanam");
  expect(announcementAt(Date.parse("2026-10-18T23:59:59.999+05:30"))?.id).toBe(
    "nimajjanam",
  );
});
it("does not revive an expired banner on later visits", () => {
  expect(announcementAt(Date.parse("2026-10-20T12:00:00+05:30"))).toBeNull();
});
