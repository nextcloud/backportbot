import { Octokit } from '@octokit/rest'
import { describe, expect, test } from 'vitest'

import { Task } from './constants'
import { getAvailableLabels, getBackportRequestsFromPR, getCommitsForPR, isAllowedBackportAuthorAssociation, isAllowedForcedBackportAuthorAssociation } from './githubUtils'

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
		const requests = await getBackportRequestsFromPR(pagedOctokit(comments), { owner: 'nextcloud', repo: 'server', prNumber: 1 } as Task)
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

// Serves `items` 100 per page, with the Link header GitHub sends
const pagedOctokit = (items: unknown[]) => new Octokit({
	request: {
		fetch: async (url: string) => {
			const page = Number(new URL(url).searchParams.get('page') ?? '1')
			const pages = Math.max(1, Math.ceil(items.length / 100))
			const headers: Record<string, string> = { 'content-type': 'application/json' }
			if (page < pages) {
				const next = new URL(url)
				next.searchParams.set('page', String(page + 1))
				headers.link = `<${next}>; rel="next"`
			}
			return new Response(JSON.stringify(items.slice((page - 1) * 100, page * 100)), { status: 200, headers })
		},
	},
})

const task = { owner: 'nextcloud', repo: 'server', prNumber: 1 } as Task

describe('GitHub lists are read past the first page', () => {
	test('commits of a pull request', async () => {
		const commits = Array.from({ length: 140 }, (_, i) => ({ sha: `sha${i}`, parents: [{}] }))
		expect(await getCommitsForPR(pagedOctokit(commits), 'nextcloud', 'server', 1)).toHaveLength(140)
	})

	test('backport requests after the 100th comment', async () => {
		const comments = Array.from({ length: 120 }, (_, i) => ({ id: i, body: 'LGTM', author_association: 'MEMBER' }))
		comments.push({ id: 999, body: '/backport to stable33', author_association: 'MEMBER' })
		const requests = await getBackportRequestsFromPR(pagedOctokit(comments), task)
		expect(requests.map(({ id }) => id)).toEqual([999])
	})

	test('labels of a repository', async () => {
		const labels = Array.from({ length: 150 }, (_, i) => ({ name: i === 149 ? '3. to review' : `label ${i}` }))
		expect(await getAvailableLabels(pagedOctokit(labels), task)).toContain('3. to review')
	})
})

describe('Pull requests GitHub cannot fully list', () => {
	test('fail instead of backporting only part of the commits', async () => {
		const commits = Array.from({ length: 250 }, (_, i) => ({ sha: `sha${i}`, parents: [{}] }))
		await expect(getCommitsForPR(pagedOctokit(commits), 'nextcloud', 'server', 1)).rejects.toThrow('250 commits or more')
	})
})
