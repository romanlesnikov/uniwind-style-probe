/**
 * Compile a project's Tailwind CSS the way uniwind's Metro transformer does,
 * and hand back the stylesheet object the native runtime would receive.
 *
 * uniwind does not export its CSS pipeline, so the transformer bundle is
 * loaded in a VM with a tail appended that re-exports the internals we need.
 * Nothing is written to node_modules.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

const PLATFORM_KEYS = { ios: 'iOS', android: 'Android', web: 'Web' }

function loadWithInternals(filePath, names) {
    const source = readFileSync(filePath, 'utf8')
        + `\n;${JSON.stringify(names)}.forEach(name => {`
        + `  try { module.exports[name] = eval(name) } catch {}`
        + `});`

    const module_ = { exports: {} }
    const compiled = vm.compileFunction(
        source,
        ['exports', 'require', 'module', '__filename', '__dirname'],
        { filename: filePath },
    )

    compiled(module_.exports, createRequire(filePath), module_, filePath, path.dirname(filePath))

    return module_.exports
}

function resolveUniwind(projectRoot) {
    const require_ = createRequire(path.join(projectRoot, 'package.json'))
    const root = path.dirname(require_.resolve('uniwind/package.json'))
    const sharedDir = path.join(root, 'dist/shared')
    const shared = readdirSync(sharedDir).find(name => /^uniwind\..*\.cjs$/.test(name))

    if (!shared) {
        throw new Error(`Could not find uniwind's shared bundle in ${sharedDir}`)
    }

    return {
        version: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version,
        transformer: path.join(root, 'dist/metro/transformer.cjs'),
        shared: path.join(sharedDir, shared),
    }
}

/**
 * The compiled stylesheet is emitted as source for `rt => ({ ... })`, where
 * `rt` is the native runtime. Every runtime call is stubbed, because the
 * checks only read the static parts of each entry.
 */
function evaluateStylesheet(virtualCode) {
    const runtime = new Proxy({}, { get: () => () => 0 })

    return new Function('rt', `return ${virtualCode};`)(runtime).stylesheet
}

export async function extract({ projectRoot = process.cwd(), cssEntryFile, platforms = ['ios', 'android'], isExpoProject = true } = {}) {
    const uniwind = resolveUniwind(projectRoot)
    const { compileCSS } = loadWithInternals(uniwind.transformer, ['compileCSS'])
    const requireShared = createRequire(uniwind.shared)
    const { UniwindBundlerConfig, Platform } = requireShared(uniwind.shared)

    if (typeof compileCSS !== 'function') {
        throw new Error(`uniwind ${uniwind.version} does not expose compileCSS — this tool needs an update`)
    }

    const sheets = {}

    for (const platform of platforms) {
        const key = PLATFORM_KEYS[platform]

        if (!key) throw new Error(`Unknown platform: ${platform}`)

        const config = new UniwindBundlerConfig({ cssEntryFile, isExpoProject }, Platform[key])

        sheets[platform] = evaluateStylesheet(await compileCSS(config))
    }

    return { sheets, uniwindVersion: uniwind.version }
}
