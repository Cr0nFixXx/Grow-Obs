import { describe, expect, it } from "vitest";
import { increased, playSound } from "@/lib/sound";

describe("increased", () => {
  it("meldet nur echte Anstiege nach dem ersten Laden", () => {
    expect(increased(null, 3)).toBe(false); // erster Stand: kein Ton beim Start
    expect(increased(2, null)).toBe(false);
    expect(increased(0, 1)).toBe(true);
    expect(increased(3, 3)).toBe(false);
    expect(increased(3, 1)).toBe(false); // gelesen → kein Ton
  });
});

describe("playSound", () => {
  it("scheitert still, wenn es keine Web Audio API gibt", () => {
    expect(playSound("message")).toBe(false);
  });
});
