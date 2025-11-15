import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { format } from './utils'

const invalidFusionPath = './f2.fusion'
const invalidFusionSource = readFileSync(invalidFusionPath, 'utf-8')

describe('Fusion parser errors', () => {
    test('throws when encountering incomplete object statements', async () => {
        await expect(
            format(invalidFusionSource, {
                parser: 'fusion',
                filepath: invalidFusionPath,
            }),
        ).rejects.toThrow(/Fusion parser error at .*f2\.fusion:5:15: Could not parse value/)
    })

    test('can be suppressed via parser options', async () => {
        const output = await format(invalidFusionSource, {
            parser: 'fusion',
            filepath: invalidFusionPath,
            fusionIgnoreParserErrors: true,
            fusionAllowIncompleteObjectStatements: true,
        })

        expect(output).toContain('Neos.Fusion:Case')
    })
})
