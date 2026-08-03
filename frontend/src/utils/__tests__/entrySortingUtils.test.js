import { describe, expect, it } from "vitest";
import {
  compareEntryValues,
  normalizeMultiSortingState,
  sortEntriesByRules,
} from "../entrySortingUtils";

describe("entrySortingUtils", () => {
  it("uses Gender, Age, Weight and Medal as nested priorities", () => {
    const rows = [
      { id: "f", gender: "Female", ageCategory: "Senior", weightCategory: "Under - 49 KG", medal: "Gold" },
      { id: "m2", gender: "Male", ageCategory: "Cadet", weightCategory: "Under - 41 KG", medal: "Silver" },
      { id: "m1", gender: "Male", ageCategory: "Cadet", weightCategory: "Under - 41 KG", medal: "Gold" },
      { id: "m3", gender: "Male", ageCategory: "Senior", weightCategory: "Under - 54 KG", medal: "Gold" },
    ];
    const rules = ["gender", "ageCategory", "weightCategory", "medal"].map((id) => ({ id, desc: false }));
    expect(sortEntriesByRules(rows, rules).map((row) => row.id)).toEqual(["m1", "m2", "m3", "f"]);
  });

  it("sorts weight-category numbers numerically", () => {
    expect(compareEntryValues("weightCategory", "Under - 54 KG", "Under - 87 KG")).toBeLessThan(0);
  });

  it("uses Gold, Silver, Bronze and X-X-X-X medal order", () => {
    const medals = ["X-X-X-X", "Bronze", "Gold", "Silver"];
    expect(sortEntriesByRules(medals.map((medal) => ({ medal })), [{ id: "medal" }]).map((row) => row.medal))
      .toEqual(["Gold", "Silver", "Bronze", "X-X-X-X"]);
  });

  it("supports descending direction independently at each level", () => {
    const rows = [{ id: "a", medal: "Gold" }, { id: "b", medal: "Bronze" }];
    expect(sortEntriesByRules(rows, [{ id: "medal", desc: true }]).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("keeps empty values last in ascending order", () => {
    expect(compareEntryValues("team", "", "AGRA")).toBeGreaterThan(0);
  });

  it("removes duplicate and unsupported rules and enforces the maximum", () => {
    expect(normalizeMultiSortingState(
      [{ id: "gender" }, { id: "gender", desc: true }, { id: "unknown" }, { id: "medal" }],
      ["gender", "medal"],
      2
    )).toEqual([{ id: "gender", desc: false }, { id: "medal", desc: false }]);
  });

  it("keeps original order when all selected values are equal", () => {
    const rows = [{ id: 1, gender: "Male" }, { id: 2, gender: "Male" }];
    expect(sortEntriesByRules(rows, [{ id: "gender" }]).map((row) => row.id)).toEqual([1, 2]);
  });
});
