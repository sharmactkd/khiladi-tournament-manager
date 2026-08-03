import { describe, expect, it } from "vitest";
import { buildBracketStructureSignature } from "../bracketUtils";
import { buildBracketEntrySignature } from "../../../utils/entrySyncUtils";

describe("TieSheet generator change detection", () => {
  const player = {
    entryId: "entry-a",
    name: "PLAYER A",
    team: "TEAM ONE",
    gender: "Male",
    ageCategory: "Cadet",
    weightCategory: "Under - 41 KG",
    event: "Kyorugi",
    subEvent: "Kyorugi",
  };

  it.each(["name", "team", "gender", "ageCategory", "weightCategory", "event", "subEvent", "fresherGroup"])(
    "changes the player signature when %s changes while count stays equal",
    (field) => {
      expect(buildBracketEntrySignature([player])).not.toBe(
        buildBracketEntrySignature([{ ...player, [field]: `${player[field]} CHANGED` }])
      );
    }
  );

  it("detects participant changes even when the bracket key is unchanged", () => {
    const createBracket = (participant) => ({
      key: "male_cadet_under_41",
      shuffledPlayers: [participant],
      gamesByRound: [
        [
          {
            id: 1,
            sides: {
              home: {
                team: {
                  id: participant.entryId,
                  entryId: participant.entryId,
                  name: participant.name,
                  team: participant.team,
                },
              },
            },
          },
        ],
      ],
    });

    expect(buildBracketStructureSignature([createBracket(player)])).not.toBe(
      buildBracketStructureSignature([
        createBracket({ ...player, name: "UPDATED PLAYER" }),
      ])
    );
  });
});
