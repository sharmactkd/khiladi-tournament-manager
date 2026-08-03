import { describe, expect, it } from "vitest";
import {
  applyCompletedCategoryMedals,
  buildBracketEntrySignature,
  chunkEntryOperations,
  formatTwelveDigitIdentifier,
  getFresherGroupValidation,
  isFresherEntry,
  isValidTwelveDigitIdentifier,
  normalizeFresherGroup,
  mergeEntryUpdates,
  reconcileEntriesWithPending,
  sanitizeEntryUpdates,
} from "../entrySyncUtils";

describe("entrySyncUtils", () => {
  it("recognizes and normalizes Fresher entries without age or weight categories", () => {
    expect(isFresherEntry({ event: "Kyorugi", subEvent: "Fresher" })).toBe(true);
    expect(isFresherEntry({ event: "Fresher", subEvent: "" })).toBe(true);
    expect(normalizeFresherGroup("  group   1 ")).toBe("GROUP 1");
  });

  it("allows four players but rejects a fifth in the same gender and Fresher group", () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      entryId: `f-${index}`,
      name: `PLAYER ${index}`,
      gender: "Male",
      event: "Kyorugi",
      subEvent: "Fresher",
      fresherGroup: "Group 1",
    }));
    expect(getFresherGroupValidation(rows).valid).toBe(true);
    expect(getFresherGroupValidation([...rows, { ...rows[0], entryId: "f-5" }]).valid).toBe(false);
  });

  it("formats optional identity fields as four-digit groups", () => {
    expect(formatTwelveDigitIdentifier("123456789012")).toBe("1234-5678-9012");
    expect(formatTwelveDigitIdentifier("12ab34 5678-901234")).toBe("1234-5678-9012");
  });

  it("accepts blank or complete 12-digit identity values only", () => {
    expect(isValidTwelveDigitIdentifier("")).toBe(true);
    expect(isValidTwelveDigitIdentifier("1234-5678-9012")).toBe(true);
    expect(isValidTwelveDigitIdentifier("1234-5678")).toBe(false);
  });

  it("splits 1,000 operations into controlled batches", () => {
    const operations = Array.from({ length: 1000 }, (_, index) => ({
      operationId: `operation-${index}`,
    }));
    const batches = chunkEntryOperations(operations, 75);

    expect(batches).toHaveLength(14);
    expect(Math.max(...batches.map((batch) => batch.length))).toBe(75);
    expect(batches.flat()).toHaveLength(1000);
  });

  it("reapplies local updates and deletes over the server snapshot", () => {
    const reconciled = reconcileEntriesWithPending(
      [
        { entryId: "a", name: "OLD A" },
        { entryId: "b", name: "OLD B" },
      ],
      [
        {
          entryId: "a",
          type: "upsert",
          updates: { name: "NEW A" },
          clientSeq: 1,
        },
        { entryId: "b", type: "delete", clientSeq: 2 },
        {
          entryId: "c",
          type: "upsert",
          updates: { name: "NEW C" },
          clientSeq: 3,
        },
      ]
    );

    expect(reconciled.map((entry) => entry.entryId).sort()).toEqual(["a", "c"]);
    expect(reconciled.find((entry) => entry.entryId === "a")?.name).toBe("NEW A");
  });

  it("changes the bracket signature when relevant content changes", () => {
    const base = [{ entryId: "a", name: "A", team: "ONE", gender: "Male" }];
    expect(buildBracketEntrySignature(base)).not.toBe(
      buildBracketEntrySignature([{ ...base[0], team: "TWO" }])
    );
  });

  it("removes row identity and UI-only fields from imported-row updates", () => {
    expect(
      sanitizeEntryUpdates({
        entryId: "imported-entry-1",
        _id: "mongo-id",
        tournamentId: "must-not-be-sent-inside-updates",
        updatedBy: "must-not-be-sent-inside-updates",
        actions: "",
        pendingSync: true,
        name: "PLAYER ONE",
        team: "TEAM ONE",
        sr: "1",
      })
    ).toEqual({
      name: "PLAYER ONE",
      team: "TEAM ONE",
      sr: "1",
    });
  });

  it("also removes invalid internal fields left in an older queued update", () => {
    expect(
      mergeEntryUpdates(
        {
          entryId: "old-imported-entry",
          pendingSync: true,
          name: "OLD NAME",
        },
        { name: "NEW NAME" }
      )
    ).toEqual({ name: "NEW NAME" });
  });

  it("fills empty medals with X-X-X-X after Gold, Silver and two Bronze are declared", () => {
    const category = {
      gender: "Male",
      ageCategory: "Cadet",
      weightCategory: "Under - 41 KG",
      event: "Kyorugi",
      subEvent: "Kyorugi",
    };
    const rows = [
      { entryId: "g", ...category, medal: "Gold" },
      { entryId: "s", ...category, medal: "Silver" },
      { entryId: "b1", ...category, medal: "Bronze" },
      { entryId: "b2", ...category, medal: "Bronze" },
      { entryId: "x1", ...category, medal: "" },
      { entryId: "x2", ...category, medal: "" },
    ];

    const result = applyCompletedCategoryMedals(rows);
    expect(result.entries.map((entry) => entry.medal)).toEqual([
      "Gold",
      "Silver",
      "Bronze",
      "Bronze",
      "X-X-X-X",
      "X-X-X-X",
    ]);
    expect(result.changedRows.map((entry) => entry.entryId)).toEqual(["x1", "x2"]);
  });

  it("does not fill X-X-X-X before the category has two Bronze medals", () => {
    const category = {
      gender: "Female",
      ageCategory: "Senior",
      weightCategory: "Under - 49 KG",
      event: "Kyorugi",
      subEvent: "Kyorugi",
    };
    const rows = [
      { ...category, medal: "Gold" },
      { ...category, medal: "Silver" },
      { ...category, medal: "Bronze" },
      { ...category, medal: "" },
    ];
    expect(applyCompletedCategoryMedals(rows).changedRows).toEqual([]);
  });
});
