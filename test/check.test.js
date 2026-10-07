import { describe, expect, it } from 'vitest'
import { check, checkBreakpoints, checkPlatformLeaks, collectBreakpoints } from '../src/check.js'
import breakpointsStripped from './fixtures/breakpoints-stripped.json' with { type: 'json' }
import healthy from './fixtures/healthy.json' with { type: 'json' }
import hoisted from './fixtures/hoisted-media-block.json' with { type: 'json' }

const sheets = fixture => Object.fromEntries(
    Object.entries(fixture).filter(([key]) => !key.startsWith('_')),
)

describe('collectBreakpoints', () => {
    it('calibrates the expected width from the majority of each prefix', () => {
        const groups = collectBreakpoints(healthy.ios)

        expect(groups.get('sm').expected).toBe(640)
        expect(groups.get('lg').expected).toBe(1024)
    })

    it('ignores classes without a breakpoint prefix', () => {
        const groups = collectBreakpoints(healthy.ios)

        expect([...groups.keys()].sort()).toEqual(['lg', 'sm'])
        expect(groups.get('sm').members).toHaveLength(3)
    })

    it('reads the prefix even when other variants come first', () => {
        const groups = collectBreakpoints({
            'dark:sm:hidden': [{ className: 'dark:sm:hidden', minWidth: 640 }],
        })

        expect(groups.get('sm').expected).toBe(640)
    })
})

describe('checkBreakpoints', () => {
    it('passes a healthy stylesheet', () => {
        expect(checkBreakpoints(healthy.ios)).toEqual([])
    })

    it('flags every class that lost its width inside a hoisted block', () => {
        const findings = checkBreakpoints(hoisted.ios)

        expect(findings.map(finding => finding.className).sort())
            .toEqual(['lg:gap-4', 'sm:flex-row', 'sm:hidden'])
    })

    it('reports the width the class should have had', () => {
        const [finding] = checkBreakpoints(hoisted.ios).filter(f => f.className === 'sm:hidden')

        expect(finding).toMatchObject({ rule: 'breakpoint-dropped', expected: 640, actual: 0 })
        expect(finding.message).toContain('applies at every width')
    })

    it('reports the group once when no class in it survived', () => {
        const findings = checkBreakpoints(breakpointsStripped.ios)

        expect(findings).toHaveLength(1)
        expect(findings[0]).toMatchObject({ className: 'sm:*', expected: null, actual: 0 })
        expect(findings[0].message).toContain('stripped entirely')
    })

    it('does not flag unprefixed classes that legitimately have no width', () => {
        const findings = checkBreakpoints(hoisted.ios)

        expect(findings.some(finding => finding.className === 'flex')).toBe(false)
    })
})

describe('checkPlatformLeaks', () => {
    it('passes when each platform variant stays in its own sheet', () => {
        expect(checkPlatformLeaks(sheets(healthy))).toEqual([])
    })

    it('flags an ios: class emitted into the android sheet', () => {
        const findings = checkPlatformLeaks(sheets(hoisted))

        expect(findings).toHaveLength(1)
        expect(findings[0]).toMatchObject({
            rule: 'platform-leaked',
            className: 'ios:-mt-12',
            expected: 'ios',
            actual: 'android',
        })
    })
})

describe('check', () => {
    it('finds nothing wrong with a healthy project', () => {
        expect(check(sheets(healthy))).toEqual([])
    })

    it('tags each breakpoint finding with the platform it came from', () => {
        const findings = check(sheets(hoisted)).filter(finding => finding.rule === 'breakpoint-dropped')

        expect(new Set(findings.map(finding => finding.platform))).toEqual(new Set(['ios', 'android']))
    })

    it('returns both rules together', () => {
        const rules = new Set(check(sheets(hoisted)).map(finding => finding.rule))

        expect(rules).toEqual(new Set(['breakpoint-dropped', 'platform-leaked']))
    })
})
