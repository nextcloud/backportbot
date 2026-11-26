import { Octokit } from '@octokit/rest'
import { describe, expect, test, vi } from 'vitest'

import { Task } from './constants'
import { getBackportRequestsFromPR, isAllowedBackportAuthorAssociation, isAllowedForcedBackportAuthorAssociation } from './githubUtils'

describe('Backport request permissions', () => {
	test.each([
		['OWNER', true, true],
		['MEMBER', true, true],
		['COLLABORATOR', true, true],
		['CONTRIBUTOR', true, false],
		['FIRST_TIME_CONTRIBUTOR', false, false],
		['NONE', false, false],
		[undefined, false, false],
	])('%s may request %s, may force %s', (association, request, force) => {
		expect(isAllowedBackportAuthorAssociation(association)).toBe(request)
		expect(isAllowedForcedBackportAuthorAssociation(association)).toBe(force)
	})
})

describe('Backport requests of a merged pull request', () => {
	const comment = (id: number, body: string, association = 'MEMBER', confused = 0) => ({
		id,
		body,
		author_association: association,
		reactions: { confused },
	})

	const requestsFrom = async (comments: ReturnType<typeof comment>[]) => {
		const octokit = { rest: { issues: { listComments: vi.fn().mockResolvedValue({ data: comments }) } } } as unknown as Octokit
		const requests = await getBackportRequestsFromPR(octokit, { owner: 'nextcloud', repo: 'server', prNumber: 1 } as Task)
		return requests.map(({ id }) => id)
	}

	test('keeps a request anyone reacted to with confused', async () => {
		expect(await requestsFrom([comment(1, '/backport to stable33', 'MEMBER', 1)])).toEqual([1])
	})

	test('drops comments that are not requests, forced requests and unauthorized authors', async () => {
		expect(await requestsFrom([
			comment(1, 'LGTM'),
			comment(2, '/backport! to stable33'),
			comment(3, '/backport to stable33', 'NONE'),
			comment(4, '/backport to stable32', 'CONTRIBUTOR'),
		])).toEqual([4])
	})
})
