import { expect, test } from "bun:test";
import { TEST_RUNNER_SMOKE } from "@/lib/test-runner-smoke";

test("test runner executes TypeScript modules", () => {
  expect(TEST_RUNNER_SMOKE).toBe("ok");
});
