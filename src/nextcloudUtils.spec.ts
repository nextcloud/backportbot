import { describe, expect, test } from 'vitest'
import { Milestone } from '@octokit/webhooks-types'
import { getMilestoneFromBase } from './nextcloudUtils'

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
