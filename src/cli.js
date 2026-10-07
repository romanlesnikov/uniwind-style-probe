#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { check } from './check.js'
import { extract } from './extract.js'

const USAGE = `
uniwind-style-probe — check that breakpoint and platform variants survive compilation

Usage:
  uniwind-style-probe --css <entry.css> [options]

Options:
  --css <file>          Tailwind CSS entry file, e.g. ./global.css   (required)
  --platform <name>     Platform to compile; repeatable. Default: ios, android
  --project <dir>       Project root used to resolve uniwind. Default: cwd
  --no-expo             The project is bare React Native, not Expo
  --json                Print findings as JSON
  --help                Show this message

Exit code is 1 when anything is wrong, so this can guard a CI job.
`.trim()

function parseArgs(argv) {
    const options = { platforms: [], isExpoProject: true, json: false }

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]

        if (arg === '--help' || arg === '-h') return { help: true }
        else if (arg === '--css') options.cssEntryFile = argv[++index]
        else if (arg === '--platform') options.platforms.push(argv[++index])
        else if (arg === '--project') options.projectRoot = path.resolve(argv[++index])
        else if (arg === '--no-expo') options.isExpoProject = false
        else if (arg === '--json') options.json = true
        else return { error: `Unknown argument: ${arg}` }
    }

    if (!options.platforms.length) options.platforms = ['ios', 'android']

    return options
}

function report(findings, counts) {
    if (!findings.length) {
        console.log(`✓ ${counts.classes} classes checked across ${counts.platforms.join(', ')} — every variant kept its condition`)

        return
    }

    const byRule = new Map()

    for (const finding of findings) {
        byRule.set(finding.rule, [...(byRule.get(finding.rule) ?? []), finding])
    }

    for (const [rule, group] of byRule) {
        console.error(`\n✗ ${rule} — ${group.length} ${group.length === 1 ? 'class' : 'classes'}`)

        for (const finding of group.slice(0, 20)) {
            console.error(`  ${finding.message}`)
        }

        if (group.length > 20) console.error(`  … and ${group.length - 20} more`)
    }

    console.error('')
}

const options = parseArgs(process.argv.slice(2))

if (options.help) {
    console.log(USAGE)
    process.exit(0)
}

if (options.error || !options.cssEntryFile) {
    console.error(options.error ?? 'Missing --css <file>')
    console.error(`\n${USAGE}`)
    process.exit(2)
}

try {
    const { sheets, uniwindVersion } = await extract(options)
    const findings = check(sheets)
    const classes = Object.keys(sheets[options.platforms[0]] ?? {}).length

    if (options.json) {
        console.log(JSON.stringify({ uniwindVersion, classes, findings }, null, 2))
    } else {
        console.log(`uniwind ${uniwindVersion}`)
        report(findings, { classes, platforms: options.platforms })
    }

    process.exit(findings.length ? 1 : 0)
} catch (error) {
    console.error(`uniwind-style-probe failed: ${error.message}`)
    process.exit(2)
}
