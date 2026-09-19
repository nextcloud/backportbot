import { afterEach, describe, expect, test, vi } from 'vitest'

describe('ALLOWED_ORGS', () => {
	afterEach(() => {
		delete process.env.ALLOWED_ORGS
		vi.resetModules()
	})

	test('uses the default org allowlist when ALLOWED_ORGS is unset', async () => {
		delete process.env.ALLOWED_ORGS
		vi.resetModules()

		const { ALLOWED_ORGS } = await import('./constants.js')

		expect(ALLOWED_ORGS).toEqual(['nextcloud', 'nextcloud-libraries', 'skjnldsv'])
	})

	test('uses ALLOWED_ORGS from the environment when configured', async () => {
		process.env.ALLOWED_ORGS = 'org-alpha org-beta org-gamma'
		vi.resetModules()

		const { ALLOWED_ORGS } = await import('./constants.js')

		expect(ALLOWED_ORGS).toEqual(['org-alpha', 'org-beta', 'org-gamma'])
	})
})