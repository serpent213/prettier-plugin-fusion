import * as prettier from 'prettier'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import config from '../prettier.config'

const plugin = new URL('../dist/index.js', import.meta.url).href

export async function format(source: string, options: prettier.Options = {}): Promise<string> {
    try {
        return await prettier.format(source, {
            ...config,
            ...options,
            plugins: [plugin],
        })
    } catch (e) {
        if (e instanceof Error) {
            throw e
        }
        if (typeof e === 'string') {
            throw new Error(e)
        }
    }
    return ''
}

export function getSourceCode(path: string) {
    try {
        let content = readFileSync(path, 'utf-8')
        return content
    } catch (e) {
        if (e instanceof Error) {
            throw e
        }
        if (typeof e === 'string') {
            throw new Error(e)
        }
    }
    return ''
}

export async function getFormattedFusionSourceCode(path: string) {
    const inputPath = `./fixtures/fusion/${path}/input.fusion`
    const outputPath = `./fixtures/fusion/${path}/output.fusion`
    let actual = await format(getSourceCode(inputPath), {
        parser: 'fusion',
        filepath: inputPath,
    })

    let expected = getSourceCode(outputPath)

    return {
        actual,
        expected,
    }
}

export function getFixturesFolderName(path: string): Array<string> {
    try {
        return readdirSync(path).filter((entry) => statSync(join(path, entry)).isDirectory())
    } catch (e) {
        if (e instanceof Error) {
            throw e
        }
        if (typeof e === 'string') {
            throw new Error(e)
        }
    }

    return []
}
