import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { simpleGit } from 'simple-git'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { CherryPickResult, Task } from './constants'
import { authConfig, cherryPickCommits, pushBranch } from './gitUtils'

vi.mock('./logUtils', () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn() }))

describe('cherryPickCommits', () => {
	let repoRoot: string

	beforeEach(() => {
		repoRoot = mkdtempSync(join(tmpdir(), 'backportbot-test-'))
	})

	afterEach(() => {
		rmSync(repoRoot, { recursive: true, force: true })
	})

	test('keeps the original commit message intact when adding [skip ci]', async () => {
		const git = simpleGit(repoRoot)
		await git.init()
		await git.addConfig('user.name', 'Test')
		await git.addConfig('user.email', 'test@example.com')
		await git.addConfig('commit.gpgsign', 'false')

		writeFileSync(join(repoRoot, 'file.txt'), 'base\n')
		await git.add('file.txt')
		await git.commit('init')
		const base = (await git.revparse(['HEAD'])).trim()

		// Source commit with a multi-line message and trailers
		const message = [
			'fix: do the thing',
			'',
			'First body line',
			'Second body line',
			'',
			'Assisted-by: Someone',
			'Signed-off-by: Test <test@example.com>',
		].join('\n')
		writeFileSync(join(repoRoot, 'file.txt'), 'source\n')
		writeFileSync(join(repoRoot, 'other.txt'), 'source\n')
		await git.add(['file.txt', 'other.txt'])
		await git.raw(['commit', '-m', message])
		const source = (await git.revparse(['HEAD'])).trim()

		// Conflicting target branch
		await git.checkout(['-b', 'target', base])
		writeFileSync(join(repoRoot, 'file.txt'), 'target\n')
		await git.add('file.txt')
		await git.commit('target change')

		const task = { commits: [source] } as Task
		const result = await cherryPickCommits(task, repoRoot)

		expect(result).toBe(CherryPickResult.CONFLICTS)
		const amended = await git.raw(['log', '-1', '--format=%B'])
		expect(amended.trim()).toBe(`${message}\n\n[skip ci]`)
	})
})

describe('installation token', () => {
	let root: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'backportbot-test-'))
	})

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	test('is sent as a header for github.com only', () => {
		const [config] = authConfig('ghs_secret')
		expect(config).toMatch(/^http\.https:\/\/github\.com\/\.extraheader=AUTHORIZATION: basic /)
		const credentials = Buffer.from(config.split('basic ')[1], 'base64').toString()
		expect(credentials).toBe('x-access-token:ghs_secret')
	})

	test('is not stored in the repository when pushing', async () => {
		const remote = join(root, 'remote.git')
		const local = join(root, 'local')
		await simpleGit().init(['--bare', remote])
		const git = simpleGit()
		await git.clone(remote, local)
		const repo = simpleGit(local)
		await repo.addConfig('user.name', 'Test')
		await repo.addConfig('user.email', 'test@example.com')
		await repo.addConfig('commit.gpgsign', 'false')
		await repo.checkout(['-b', 'backport/1/stable33'])
		await repo.commit('backport', undefined, { '--allow-empty': null })

		await pushBranch({} as Task, local, 'ghs_secret', 'backport/1/stable33')

		expect((await simpleGit(remote).branchLocal()).all).toContain('backport/1/stable33')
		expect((await repo.raw(['config', '--list', '--show-origin']))).not.toContain('ghs_secret')
		expect((await repo.remote(['get-url', 'origin']))?.trim()).toBe(remote)
	})
})
