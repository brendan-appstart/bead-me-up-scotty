import { expect, test } from "bun:test";
import { filterDepCandidates } from "@/lib/dep-picker";

test('"foo" matches id/title literals and excludes linked ids', () => {
  const beads = [
    { id: "foo-1", title: "Unrelated title" },
    { id: "scotty-abc", title: "Fix the foo widget" },
    { id: "foo-linked", title: "Already wired" },
    { id: "self", title: "Contains foo too" },
    { id: "other", title: "No match here" },
  ];

  expect(
    filterDepCandidates(beads, "foo", {
      currentId: "self",
      linkedIds: ["foo-linked"],
    }).map((b) => b.id),
  ).toEqual(["foo-1", "scotty-abc"]);
});

test("empty query excludes the current bead and already-linked targets", () => {
  const beads = [
    { id: "self", title: "Current bead" },
    { id: "linked", title: "Already a dependency" },
    { id: "open-1", title: "Available" },
    { id: "open-2", title: "Also available" },
  ];

  expect(
    filterDepCandidates(beads, "", {
      currentId: "self",
      linkedIds: ["linked"],
    }).map((b) => b.id),
  ).toEqual(["open-1", "open-2"]);
});
