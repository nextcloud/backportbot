import { describe, expect, test } from 'vitest'
import { Milestone } from '@octokit/webhooks-types'
import { getBackportBody, getFailureCommentBody, getLabelsForPR, getMilestoneFromBase } from './nextcloudUtils'
import { LABEL_BACKPORT, LABEL_TO_REVIEW, LEARN_MORE, STEP_AMEND_SKIP_CI, STEP_REMOVE_EMPTY_COMMITS, STEP_REVIEW_CONFLICTS, Task, WARN_CONFLICTS, WARN_DIFF } from './constants'

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

describe('Returns labels for a backport PR', () => {
	test('Returns empty array when no labels and no to-review in repo', () => {
		expect(getLabelsForPR([], [])).toEqual([])
	})

	test('Returns labels without backport-request label', () => {
		expect(getLabelsForPR([LABEL_BACKPORT, 'bug', 'enhancement'], [])).toEqual(['bug', 'enhancement'])
	})

	test('Filters out kanban labels', () => {
		expect(getLabelsForPR(['bug', '1. To do', '2. In progress'], [])).toEqual(['bug'])
	})

	test('Prepends to-review label when present in repo labels', () => {
		expect(getLabelsForPR(['bug'], [LABEL_TO_REVIEW])).toEqual([LABEL_TO_REVIEW, 'bug'])
	})

	test('Does not add to-review label when not in repo labels', () => {
		expect(getLabelsForPR(['bug'], ['other-label'])).toEqual(['bug'])
	})

	test('Removes duplicate labels', () => {
		expect(getLabelsForPR([LABEL_TO_REVIEW, 'bug'], [LABEL_TO_REVIEW])).toEqual([LABEL_TO_REVIEW, 'bug'])
	})
})

describe('Generates correct backport PR body', () => {
	test('Simple backport with no issues', () => {
		const body = getBackportBody(123, false, false, false, false)
		expect(body).toBe(`Backport of #123${LEARN_MORE}`)
	})

	test('Backport with conflicts', () => {
		const body = getBackportBody(123, true, false, false, false)
		expect(body).toContain(`Warning, ${WARN_CONFLICTS}`)
		expect(body).toContain(`- [ ] ${STEP_REVIEW_CONFLICTS}`)
	})

	test('Backport with diff on partial request does not warn about diff', () => {
		const body = getBackportBody(123, false, true, false, false, false)
		expect(body).not.toContain(WARN_DIFF)
		expect(body).toBe(`Backport of #123${LEARN_MORE}`)
	})

	test('Full backport with diff warns about diff', () => {
		const body = getBackportBody(123, false, true, false, false, true)
		expect(body).toContain(`Warning, ${WARN_DIFF}`)
		expect(body).toContain(`- [ ] ${STEP_REVIEW_CONFLICTS}`)
	})

	test('Backport with empty commits adds remove-empty-commits step', () => {
		const body = getBackportBody(123, false, false, true, false)
		expect(body).toContain(`- [ ] ${STEP_REMOVE_EMPTY_COMMITS}`)
	})

	test('Backport with skip-ci commits adds amend-skip-ci step', () => {
		const body = getBackportBody(123, false, false, false, true)
		expect(body).toContain(`- [ ] ${STEP_AMEND_SKIP_CI}`)
	})

	test('Full backport with conflicts and diff uses diff warning', () => {
		const body = getBackportBody(123, true, true, false, false, true)
		expect(body).toContain(`Warning, ${WARN_DIFF}`)
		expect(body).not.toContain(WARN_CONFLICTS)
	})

	test('Backport with all issues deduplicates review-conflicts step', () => {
		const body = getBackportBody(123, true, true, true, true, true)
		const reviewConflictsCount = (body.match(new RegExp(STEP_REVIEW_CONFLICTS, 'g')) || []).length
		expect(reviewConflictsCount).toBe(1)
		expect(body).toContain(`- [ ] ${STEP_REMOVE_EMPTY_COMMITS}`)
		expect(body).toContain(`- [ ] ${STEP_AMEND_SKIP_CI}`)
	})

	test('Body always ends with learn more link', () => {
		const body = getBackportBody(456, false, false, false, false)
		expect(body).toContain(LEARN_MORE)
	})
})

describe('Generates correct failure comment body', () => {
	const task: Task = {
		installationId: 1,
		owner: 'nextcloud',
		repo: 'server',
		branch: 'stable28',
		commits: ['abc1234567890', 'def1234567890'],
		prNumber: 42,
		prTitle: 'Fix something',
		commentId: 99,
		author: 'testuser',
		isFullRequest: false,
	}

	test('Contains the target branch name', () => {
		const body = getFailureCommentBody(task, 'backport/stable28/pr-42')
		expect(body).toContain('stable28')
	})

	test('Contains the cherry-pick commands with short commit hashes', () => {
		const body = getFailureCommentBody(task, 'backport/stable28/pr-42')
		expect(body).toContain('git cherry-pick abc12345 def12345')
	})

	test('Contains default error message when none provided', () => {
		const body = getFailureCommentBody(task, 'backport/stable28/pr-42')
		expect(body).toContain('Error: Unknown error')
	})

	test('Contains provided error message', () => {
		const body = getFailureCommentBody(task, 'backport/stable28/pr-42', 'Merge conflict in file.ts')
		expect(body).toContain('Error: Merge conflict in file.ts')
	})

	test('Contains the backport target branch for checkout', () => {
		const body = getFailureCommentBody(task, 'backport/stable28/pr-42')
		expect(body).toContain('git checkout -b backport/stable28/pr-42')
	})

	test('Contains learn more link', () => {
		const body = getFailureCommentBody(task, 'backport/stable28/pr-42')
		expect(body).toContain(LEARN_MORE)
	})
})
