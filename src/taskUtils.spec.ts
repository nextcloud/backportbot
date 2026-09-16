import { describe, expect, test } from 'vitest'
import type { BackportRequest } from './constants'
import { createTasks } from './taskUtils'

describe('createTasks', () => {
	test('creates one task per branch', () => {
		const request: BackportRequest = {
			commits: ['abc1234'],
			branches: ['stable28', 'stable29', 'stable30'],
			isForced: false,
			isFullRequest: false,
			isFriendly: false,
		}

		const tasks = createTasks(
			{
				installationId: 1,
				owner: 'nextcloud',
				repo: 'server',
				prNumber: 123,
				prTitle: 'Fix something',
				commentId: 456,
				author: 'josh',
			},
			request,
		)

		expect(tasks).toEqual([
			{
				installationId: 1,
				owner: 'nextcloud',
				repo: 'server',
				prNumber: 123,
				prTitle: 'Fix something',
				commentId: 456,
				author: 'josh',
				branch: 'stable28',
				commits: ['abc1234'],
				isFullRequest: false,
			},
			{
				installationId: 1,
				owner: 'nextcloud',
				repo: 'server',
				prNumber: 123,
				prTitle: 'Fix something',
				commentId: 456,
				author: 'josh',
				branch: 'stable29',
				commits: ['abc1234'],
				isFullRequest: false,
			},
			{
				installationId: 1,
				owner: 'nextcloud',
				repo: 'server',
				prNumber: 123,
				prTitle: 'Fix something',
				commentId: 456,
				author: 'josh',
				branch: 'stable30',
				commits: ['abc1234'],
				isFullRequest: false,
			},
		])
	})

	test('deduplicates branches', () => {
		const request: BackportRequest = {
			commits: ['abc1234'],
			branches: ['stable28', 'stable28', 'stable29'],
			isForced: false,
			isFullRequest: false,
			isFriendly: false,
		}

		const tasks = createTasks(
			{
				installationId: 1,
				owner: 'nextcloud',
				repo: 'server',
				prNumber: 123,
				prTitle: 'Fix something',
				commentId: 456,
				author: 'josh',
			},
			request,
		)

		expect(tasks.map(task => task.branch)).toEqual([
			'stable28',
			'stable29',
		])
	})
})
