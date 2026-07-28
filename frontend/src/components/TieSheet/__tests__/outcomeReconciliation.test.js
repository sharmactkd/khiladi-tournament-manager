import { describe, expect, it } from "vitest";
import {
  generateSingleEliminationGameStructure,
  reconcileBracketOutcomes,
} from "../bracketUtils";

const bracket = (key, players) => {
  const structure = generateSingleEliminationGameStructure(players);
  return {
    key,
    shuffledPlayers: players,
    game: structure.finalGame,
    gamesByRound: structure.gamesByRound,
  };
};

describe("reconcileBracketOutcomes", () => {
  const players = [
    { entryId: "a", name: "PLAYER A", team: "ONE" },
    { entryId: "b", name: "PLAYER B", team: "TWO" },
  ];

  it("preserves an outcome when the bracket participants are unchanged", () => {
    const previous = bracket("male_cadet_40", players);
    const next = bracket("male_cadet_40", players);
    expect(
      reconcileBracketOutcomes({
        previousBrackets: [previous],
        nextBrackets: [next],
        previousOutcomes: { male_cadet_40: { 1: "home" } },
      })
    ).toEqual({ male_cadet_40: { 1: "home" } });
  });

  it("removes an outcome when a match id is reused for different players", () => {
    const previous = bracket("male_cadet_40", players);
    const next = bracket("male_cadet_40", [
      players[0],
      { entryId: "c", name: "PLAYER C", team: "THREE" },
    ]);
    expect(
      reconcileBracketOutcomes({
        previousBrackets: [previous],
        nextBrackets: [next],
        previousOutcomes: { male_cadet_40: { 1: "away" } },
      })
    ).toEqual({ male_cadet_40: {} });
  });

  it("removes outcomes for brackets that no longer exist", () => {
    const previous = bracket("removed_category", players);
    expect(
      reconcileBracketOutcomes({
        previousBrackets: [previous],
        nextBrackets: [],
        previousOutcomes: { removed_category: { 1: "home" } },
      })
    ).toEqual({});
  });
});
