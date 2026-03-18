import { describe, expect, test } from 'vitest'
import { Milestone } from '@octokit/webhooks-types'
import { getBackportBody, getMilestoneFromBase } from './nextcloudUtils'
import { LEARN_MORE, STEP_AMEND_SKIP_CI, STEP_REMOVE_EMPTY_COMMITS, STEP_REVIEW_CHANGES, STEP_REVIEW_CONFLICTS, WARN_CONFLICTS, WARN_DIFF } from './constants'

describe('Match branch branch to milestone', () => {
	const branches = [
		'stable28',
		'stable26',
		'stable21',
		'stable1',
		'stable-3.11',
		'stable-4.0.0',
	]

	const milestones = [
		'Nextcloud 21.1.0',
		'Nextcloud 21.0.1',
		'Nextcloud 26.0.10',
		'Nextcloud 26.0.9',
		'Nextcloud 21.1.0',
		'Nextcloud 1.0.0',
		'Nextcloud 1.1.1',
		'💞 Next Major (29)',
		'💙 Next Patch (28)',
		'💔 Backlog',
		'3.11.1',
		'3.10.4',
	].map(title => ({ title })) as Milestone[]

	const expectedMilestones = [
		'💙 Next Patch (28)',
		'Nextcloud 26.0.9',
		'Nextcloud 21.0.1',
		'Nextcloud 1.0.0',
		'3.11.1',
		undefined,
	]

	branches.forEach((branch, index) => {
		test(`Branch '${branch}' should return milestone '${expectedMilestones[index]}'`, () => {
			expect(getMilestoneFromBase(branch, milestones)?.title).toEqual(expectedMilestones[index])
		})
	})
})

describe('Throws error for invalid branch', () => {
	const branches = [
		'stable',
		'',
	]
	const milestones = [
		'Nextcloud 21.1.0',
		'Nextcloud 21.0.1',
		'Nextcloud 1.0.0',
		'Nextcloud 1.1.1',
		'💞 Next Major (29)',
		'💙 Next Patch (28)',
		'💔 Backlog',
		'3.11.1',
		'3.10.4',
	].map(title => ({ title })) as Milestone[]

	branches.forEach(branch => {
		test(`Branch '${branch}'`, () => {
			expect(() => getMilestoneFromBase(branch, milestones))
				.toThrow(`Could not extract version from branch \`${branch}\``)
		})
	})
})

describe('getBackportBody', () => {
	test('returns simple body with no warnings or steps when nothing is wrong', () => {
		const body = getBackportBody(42, false, false, false, false)
		expect(body).toBe(`Backport of #42${LEARN_MORE}`)
	})

	test('includes conflict warning and STEP_REVIEW_CONFLICTS when hasConflicts is true', () => {
		const body = getBackportBody(42, true, false, false, false)
		expect(body).toContain(`Warning, ${WARN_CONFLICTS}`)
		expect(body).toContain(`- [ ] ${STEP_REVIEW_CONFLICTS}`)
		expect(body).not.toContain(STEP_REVIEW_CHANGES)
	})

	test('includes diff warning and STEP_REVIEW_CHANGES (not STEP_REVIEW_CONFLICTS) when hasDiff and isFullRequest', () => {
		const body = getBackportBody(42, false, true, false, false, true)
		expect(body).toContain(`Warning, ${WARN_DIFF}`)
		expect(body).toContain(`- [ ] ${STEP_REVIEW_CHANGES}`)
		expect(body).not.toContain(STEP_REVIEW_CONFLICTS)
	})

	test('hasDiff without isFullRequest does not add diff warning or step', () => {
		const body = getBackportBody(42, false, true, false, false, false)
		expect(body).not.toContain(WARN_DIFF)
		expect(body).not.toContain(STEP_REVIEW_CHANGES)
	})

	test('includes STEP_REMOVE_EMPTY_COMMITS when hasEmptyCommits is true', () => {
		const body = getBackportBody(42, false, false, true, false)
		expect(body).toContain(`- [ ] ${STEP_REMOVE_EMPTY_COMMITS}`)
	})

	test('includes STEP_AMEND_SKIP_CI when hasSkipCiCommits is true', () => {
		const body = getBackportBody(42, false, false, false, true)
		expect(body).toContain(`- [ ] ${STEP_AMEND_SKIP_CI}`)
	})

	test('deduplicates steps when both hasConflicts and hasDiff are true (full request)', () => {
		const body = getBackportBody(42, true, true, false, false, true)
		// STEP_REVIEW_CONFLICTS from conflicts and STEP_REVIEW_CHANGES from diff should both be present but each once
		const conflictsCount = (body.match(new RegExp(STEP_REVIEW_CONFLICTS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
		const changesCount = (body.match(new RegExp(STEP_REVIEW_CHANGES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
		expect(conflictsCount).toBe(1)
		expect(changesCount).toBe(1)
	})

	test('warning text has no leading space', () => {
		const body = getBackportBody(42, true, false, false, false)
		expect(body).not.toContain('\n\n Warning,')
		expect(body).toContain('\n\nWarning,')
	})

	test('always ends with LEARN_MORE', () => {
		expect(getBackportBody(1, true, true, true, true, true)).toContain(LEARN_MORE)
		expect(getBackportBody(1, false, false, false, false)).toContain(LEARN_MORE)
		expect(getBackportBody(1, true, true, true, true, true).endsWith(LEARN_MORE)).toBe(true)
		expect(getBackportBody(1, false, false, false, false).endsWith(LEARN_MORE)).toBe(true)
	})
})
