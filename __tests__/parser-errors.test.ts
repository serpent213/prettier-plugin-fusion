import { describe, expect, test, vi } from "vitest"
import { readFileSync } from "node:fs"
import { format } from "./utils"

const invalidFusionPath = "./__tests__/fixtures/invalid.fusion"
const invalidFusionSource = readFileSync(invalidFusionPath, "utf-8")

describe("Fusion parser errors", () => {
  test("throws when encountering incomplete object statements", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})

    try {
      await expect(
        format(invalidFusionSource, {
          parser: "fusion",
          filepath: invalidFusionPath
        })
      ).rejects.toThrow(/Fusion parser error at .*invalid\.fusion:5:15: Could not parse value/)
    } finally {
      logSpy.mockRestore()
      debugSpy.mockRestore()
    }
  })

  test("can be suppressed via parser options", async () => {
    const output = await format(invalidFusionSource, {
      parser: "fusion",
      filepath: invalidFusionPath,
      fusionIgnoreParserErrors: true,
      fusionAllowIncompleteObjectStatements: true
    })

    expect(output).toContain("Neos.Fusion:Case")
  })
})
