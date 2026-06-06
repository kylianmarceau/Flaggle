import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage, type PublicRoundState, type ServerMessage } from "../src/core/multiplayer";

describe("multiplayer public protocol", () => {
  it("does not expose answers in public round state", () => {
    const round: PublicRoundState = {
      roundNumber: 1,
      flagSrc: "assets/flags/jp.svg",
      startedAt: 1000,
      endsAt: null,
    };

    expect(Object.keys(round).sort()).toEqual(["endsAt", "flagSrc", "roundNumber", "startedAt"]);
  });

  it("rejects public round messages that include private country identity", () => {
    const message = parseServerMessage({
      type: "ROUND_STARTED",
      round: {
        roundNumber: 1,
        flagSrc: "assets/flags/jp.svg",
        startedAt: 1000,
        endsAt: null,
        countryName: "Japan",
      },
    });

    expect(message.ok).toBe(false);
  });

  it("normalizes safe client room inputs", () => {
    const message = parseClientMessage({ type: "JOIN_ROOM", roomCode: " pin42 ", playerName: "  Ada   Lovelace " });

    expect(message.ok).toBe(true);
    expect(message.ok ? message.message : null).toEqual({ type: "JOIN_ROOM", roomCode: "PIN42", playerName: "Ada Lovelace" });
  });

  it("reveals country identity only in round-ended messages", () => {
    const message: ServerMessage = {
      type: "ROUND_ENDED",
      countryCode: "JP",
      countryName: "Japan",
      results: [],
    };

    expect(message.countryName).toBe("Japan");
  });
});
