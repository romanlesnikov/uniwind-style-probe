/**
 * Pure checks over a compiled uniwind stylesheet.
 *
 * A uniwind stylesheet maps a class name to an array of style entries:
 *   { className, minWidth, maxWidth, entries, ... }
 *
 * Nothing here touches the filesystem or uniwind itself, so every rule in this
 * file is unit-testable against a fixture.
 */

const BREAKPOINT_PREFIX = /^(?:[^:]*:)*?(sm|md|lg|xl|2xl):/
const PLATFORM_PREFIX = /^(?:[^:]*:)*?(ios|android|web):/

function firstEntry(value) {
    return Array.isArray(value) ? value[0] : value
}

function prefixOf(className, pattern) {
    const match = pattern.exec(className)

    return match ? match[1] : null
}

/**
 * Group every breakpoint class by its prefix and record the minWidth it
 * compiled to. The expected value is the one the majority of classes agree on,
 * so the check calibrates itself from the stylesheet and needs no config.
 */
export function collectBreakpoints(stylesheet) {
    const groups = new Map()

    for (const [className, value] of Object.entries(stylesheet)) {
        const prefix = prefixOf(className, BREAKPOINT_PREFIX)

        if (!prefix) continue

        const entry = firstEntry(value)
        const minWidth = entry?.minWidth ?? 0
        const group = groups.get(prefix) ?? { prefix, counts: new Map(), members: [] }

        group.counts.set(minWidth, (group.counts.get(minWidth) ?? 0) + 1)
        group.members.push({ className, minWidth })
        groups.set(prefix, group)
    }

    for (const group of groups.values()) {
        group.expected = [...group.counts.entries()]
            .filter(([minWidth]) => minWidth > 0)
            .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
    }

    return groups
}

/**
 * A breakpoint variant that compiled to minWidth 0 applies at every width, so
 * a phone renders the desktop layout. That is the failure this tool exists for.
 */
export function checkBreakpoints(stylesheet) {
    const findings = []

    for (const group of collectBreakpoints(stylesheet).values()) {
        // Every class in the group lost its condition, so there is no majority
        // left to calibrate against. Report the group rather than guess a width.
        if (group.expected === 0) {
            findings.push({
                rule: 'breakpoint-dropped',
                className: `${group.prefix}:*`,
                expected: null,
                actual: 0,
                message: `all ${group.members.length} ${group.prefix}: classes compiled to minWidth 0 — the breakpoint was stripped entirely`,
            })

            continue
        }

        for (const { className, minWidth } of group.members) {
            if (minWidth === group.expected) continue

            findings.push({
                rule: 'breakpoint-dropped',
                className,
                expected: group.expected,
                actual: minWidth,
                message: minWidth === 0
                    ? `${className} lost its breakpoint and now applies at every width (expected minWidth ${group.expected})`
                    : `${className} compiled to minWidth ${minWidth}, but every other ${group.prefix}: class uses ${group.expected}`,
            })
        }
    }

    return findings
}

/**
 * An `ios:` class has no business in the Android stylesheet, and vice versa.
 * Needs both platform sheets, because leakage is only visible by comparison.
 */
export function checkPlatformLeaks(sheets) {
    const findings = []
    const platforms = Object.keys(sheets)

    for (const platform of platforms) {
        for (const className of Object.keys(sheets[platform])) {
            const tagged = prefixOf(className, PLATFORM_PREFIX)

            if (!tagged || tagged === platform) continue

            findings.push({
                rule: 'platform-leaked',
                className,
                expected: tagged,
                actual: platform,
                message: `${className} is tagged ${tagged}: but was emitted into the ${platform} stylesheet`,
            })
        }
    }

    return findings
}

export function check(sheets) {
    const findings = []

    for (const [platform, stylesheet] of Object.entries(sheets)) {
        findings.push(...checkBreakpoints(stylesheet).map(finding => ({ ...finding, platform })))
    }

    findings.push(...checkPlatformLeaks(sheets))

    return findings
}
