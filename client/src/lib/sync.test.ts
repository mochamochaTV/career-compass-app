import { describe, expect, it } from "vitest";
import { mergeArrays, mergeData, sameData } from "./sync";

const c = (id: string, name: string, updatedAt?: string) => ({ id, name, ...(updatedAt ? { updatedAt } : {}) });

describe("sync merge", () => {
  it("keeps additions made on both devices", () => {
    const base = [c("1", "A")];
    const out = mergeArrays("companies", [c("1", "A"), c("2", "PC")], [c("1", "A"), c("3", "phone")], base);
    expect(out.map((x) => (x as { id: string }).id).sort()).toEqual(["1", "2", "3"]);
  });
  it("adopts the other side's edit when this side is unchanged", () => {
    const base = [c("1", "A")];
    expect(mergeArrays("cards", [c("1", "A")], [c("1", "A2")], base)).toEqual([c("1", "A2")]);
  });
  it("propagates deletions, and does not resurrect deleted items", () => {
    const base = [c("1", "A"), c("2", "B")];
    expect(mergeArrays("cards", [c("1", "A")], [c("1", "A"), c("2", "B")], base)).toEqual([c("1", "A")]);
    expect(mergeArrays("cards", [c("1", "A"), c("2", "B")], [c("1", "A")], base)).toEqual([c("1", "A")]);
  });
  it("keeps an edited item when the other side deleted it", () => {
    const base = [c("1", "A")];
    expect(mergeArrays("cards", [c("1", "A-edited")], [], base)).toEqual([c("1", "A-edited")]);
  });
  it("resolves conflicts by updatedAt, else prefers local", () => {
    const base = [c("1", "A", "2026-01-01")];
    expect(mergeArrays("companies", [c("1", "L", "2026-02-01")], [c("1", "R", "2026-03-01")], base)).toEqual([c("1", "R", "2026-03-01")]);
    expect(mergeArrays("cards", [c("1", "L")], [c("1", "R")], [c("1", "A")])).toEqual([c("1", "L")]);
  });
  it("unions on first sync (no base)", () => {
    const out = mergeArrays("cards", [c("1", "L")], [c("2", "R")], undefined);
    expect(out).toHaveLength(2);
  });
  it("follows the remote order unless local reordered", () => {
    const base = [c("1", "A"), c("2", "B")];
    expect(mergeArrays("companies", base, [c("2", "B"), c("1", "A")], base).map((x) => (x as { id: string }).id)).toEqual(["2", "1"]);
    expect(mergeArrays("companies", [c("2", "B"), c("1", "A")], base, base).map((x) => (x as { id: string }).id)).toEqual(["2", "1"]);
  });
  it("merges string lists and name-keyed colors", () => {
    expect(mergeArrays("cardCategories", ["基本", "新"], ["基本", "志望動機"], ["基本"]).sort()).toEqual(["基本", "志望動機", "新"].sort());
    expect(mergeArrays("scheduleCategoryColors", [{ name: "面接", color: "blue" }], [{ name: "面接", color: "red" }], [{ name: "面接", color: "blue" }])).toEqual([{ name: "面接", color: "red" }]);
  });
  it("sameData ignores key order", () => {
    expect(sameData({ cards: [{ id: "1", a: 1, b: 2 }] }, { cards: [{ b: 2, id: "1", a: 1 }] })).toBe(true);
    expect(mergeData({}, {}, null).cards).toEqual([]);
  });
});
