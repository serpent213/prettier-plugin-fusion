import { test, describe, expect } from 'vitest'
import { getFormattedFusionSourceCode, getFixturesFolderName } from './utils'

const fixturesFolderName = getFixturesFolderName('./fixtures/fusion')

describe('Fusion', () => {
    for (let folderName of fixturesFolderName) {
        test(folderName, async () => {
            let { actual, expected } = await getFormattedFusionSourceCode(folderName)
            expect(actual, 'Missing actual (input) file').to.not.be.undefined
            expect(expected, 'Missing expected (output) file').to.not.be.undefined
            expect(actual).toBe(expected)
            expect(actual).toMatchSnapshot()
        })
    }
})
