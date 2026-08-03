import { describe, expect, it } from "vitest";
import {
  AUTO_CATEGORY_MEDAL_SOURCE,
  buildMedalCategoryKey,
  buildBracketEntrySignature,
  chunkEntryOperations,
  countCategoryMedals,
  isCategoryPodiumComplete,
  mergeEntryUpdates,
  reconcileCompletedCategoryMedals,
  reconcileEntriesWithPending,
  sanitizeEntryUpdates,
} from "../entrySyncUtils";

describe("entrySyncUtils", () => {
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
        actions: "",
        pendingSync: true,
        unexpectedUiField: "must never reach the API",
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

  const categoryRow = (entryId, medal = "", overrides = {}) => ({
    entryId,
    name: `PLAYER ${entryId}`,
    gender: "Male",
    ageCategory: "Senior",
    weightCategory: "Under - 54 KG",
    event: "Kyorugi",
    subEvent: "Kyorugi",
    medal,
    medalSource: medal ? "manual" : "",
    ...overrides,
  });

  it("auto-assigns X-X-X-X after exactly one Gold, one Silver and two Bronze", () => {
    const rows = [
      categoryRow("gold", "Gold"),
      categoryRow("silver", "Silver"),
      categoryRow("bronze-1", "Bronze"),
      categoryRow("bronze-2", "Bronze"),
      categoryRow("remaining-1"),
      categoryRow("remaining-2"),
    ];
    const key = buildMedalCategoryKey(rows[0]);
    const result = reconcileCompletedCategoryMedals(rows, [key], {
      now: "2026-08-02T10:00:00.000Z",
    });

    expect(result.changedRows.map((row) => row.entryId)).toEqual([
      "remaining-1",
      "remaining-2",
    ]);
    expect(result.entries.slice(4).map((row) => row.medal)).toEqual([
      "X-X-X-X",
      "X-X-X-X",
    ]);
    expect(result.entries.slice(4).map((row) => row.medalSource)).toEqual([
      AUTO_CATEGORY_MEDAL_SOURCE,
      AUTO_CATEGORY_MEDAL_SOURCE,
    ]);
  });

  it("does nothing while the manual podium is incomplete", () => {
    const rows = [
      categoryRow("gold", "Gold"),
      categoryRow("silver", "Silver"),
      categoryRow("bronze", "Bronze"),
      categoryRow("remaining"),
    ];
    const key = buildMedalCategoryKey(rows[0]);

    expect(countCategoryMedals(rows, key)).toEqual({
      Gold: 1,
      Silver: 1,
      Bronze: 1,
    });
    expect(isCategoryPodiumComplete(countCategoryMedals(rows, key))).toBe(false);
    expect(reconcileCompletedCategoryMedals(rows, [key]).changedRows).toEqual([]);
  });

  it("clears only category-auto X when the podium becomes incomplete", () => {
    const rows = [
      categoryRow("gold"),
      categoryRow("silver", "Silver"),
      categoryRow("bronze-1", "Bronze"),
      categoryRow("bronze-2", "Bronze"),
      categoryRow("auto-x", "X-X-X-X", {
        medalSource: AUTO_CATEGORY_MEDAL_SOURCE,
      }),
      categoryRow("manual-x", "X-X-X-X", { medalSource: "manual" }),
    ];
    const key = buildMedalCategoryKey(rows[0]);
    const result = reconcileCompletedCategoryMedals(rows, [key]);

    expect(result.entries.find((row) => row.entryId === "auto-x")).toMatchObject({
      medal: "",
      medalSource: "",
      medalUpdatedAt: null,
    });
    expect(result.entries.find((row) => row.entryId === "manual-x")).toMatchObject({
      medal: "X-X-X-X",
      medalSource: "manual",
    });
  });

  it("does not overwrite TieSheet-controlled medals or another category", () => {
    const firstCategory = [
      categoryRow("gold", "Gold"),
      categoryRow("silver", "Silver"),
      categoryRow("bronze-1", "Bronze"),
      categoryRow("bronze-2", "Bronze"),
      categoryRow("tiesheet", "", { medalSource: "tiesheet" }),
      categoryRow("remaining"),
    ];
    const otherCategory = categoryRow("other", "", {
      weightCategory: "Under - 58 KG",
    });
    const key = buildMedalCategoryKey(firstCategory[0]);
    const result = reconcileCompletedCategoryMedals(
      [...firstCategory, otherCategory],
      [key]
    );

    expect(result.entries.find((row) => row.entryId === "tiesheet")).toMatchObject({
      medal: "",
      medalSource: "tiesheet",
    });
    expect(result.entries.find((row) => row.entryId === "remaining")).toMatchObject({
      medal: "X-X-X-X",
      medalSource: AUTO_CATEGORY_MEDAL_SOURCE,
    });
    expect(result.entries.find((row) => row.entryId === "other")).toMatchObject({
      medal: "",
      medalSource: "",
    });
  });

  it("does not complete a category containing duplicate podium medals", () => {
    const rows = [
      categoryRow("gold-1", "Gold"),
      categoryRow("gold-2", "Gold"),
      categoryRow("silver", "Silver"),
      categoryRow("bronze-1", "Bronze"),
      categoryRow("bronze-2", "Bronze"),
      categoryRow("remaining"),
    ];
    const key = buildMedalCategoryKey(rows[0]);

    expect(isCategoryPodiumComplete(countCategoryMedals(rows, key))).toBe(false);
    expect(reconcileCompletedCategoryMedals(rows, [key]).changedRows).toEqual([]);
  });
});
