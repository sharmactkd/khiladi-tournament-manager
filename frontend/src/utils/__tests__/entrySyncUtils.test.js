import { describe, expect, it } from "vitest";
import {
  buildBracketEntrySignature,
  buildBracketGroupSignatures,
  chunkEntryOperations,
  reconcileEntriesWithPending,
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

  it("ignores row order, serial number and non-bracket contact changes", () => {
    const rows = [
      { entryId: "a", name: "A", srNo: 1, coachContact: "111" },
      { entryId: "b", name: "B", srNo: 2, coachContact: "222" },
    ];
    const reordered = [
      { ...rows[1], srNo: 1, coachContact: "999" },
      { ...rows[0], srNo: 2, coachContact: "888" },
    ];
    expect(buildBracketEntrySignature(rows)).toBe(
      buildBracketEntrySignature(reordered)
    );
  });

  it("builds stable per-category signatures", () => {
    const rows = [
      { entryId: "a", gender: "Male", ageCategory: "Cadet", name: "A" },
      { entryId: "b", gender: "Female", ageCategory: "Cadet", name: "B" },
    ];
    expect(Object.keys(buildBracketGroupSignatures(rows))).toHaveLength(2);
  });
});
