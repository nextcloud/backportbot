import { beforeEach, describe, expect, test, vi } from 'vitest'

import { Task } from './constants'
import { backport } from './backport'
import * as github from './githubUtils'
import * as git from './gitUtils'

vi.mock('./logUtils', () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }))
vi.mock('./githubUtils', async (importOriginal) => ({
	...await importOriginal<typeof import('./githubUtils')>(),
	getAuthToken: vi.fn().mockResolvedValue('token'),
	addReaction: vi.fn().mockResolvedValue(undefined),
	commentOnPR: vi.fn().mockResolvedValue(undefined),
	getOpenPullRequestForBranch: vi.fn(),
}))
vi.mock('./gitUtils', () => ({
	cloneAndCacheRepo: vi.fn().mockRejectedValue(new Error('offline')),
	pushBranch: vi.fn(),
}))

const task = { owner: 'nextcloud', repo: 'server', branch: 'stable33', prNumber: 123, commits: ['abcdef1'] } as Task

describe('backport', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test('leaves an open backport pull request alone', async () => {
		vi.mocked(github.getOpenPullRequestForBranch).mockResolvedValue({ number: 456, html_url: '' })

		await backport(task)

		expect(github.getOpenPullRequestForBranch).toHaveBeenCalledWith(expect.anything(), task, 'backport/123/stable33')
		expect(git.cloneAndCacheRepo).not.toHaveBeenCalled()
		expect(git.pushBranch).not.toHaveBeenCalled()
		expect(github.commentOnPR).toHaveBeenCalledWith(expect.anything(), task, expect.stringContaining('#456'))
	})

	test('starts the backport when none is open', async () => {
		vi.mocked(github.getOpenPullRequestForBranch).mockResolvedValue(null)

		await expect(backport(task)).rejects.toThrow('Failed to clone repository')
		expect(git.cloneAndCacheRepo).toHaveBeenCalled()
	})
})
