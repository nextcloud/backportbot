import { existsSync, mkdirSync} from 'node:fs'
import { join } from 'node:path'
import { CleanOptions, simpleGit } from 'simple-git'

import { CACHE_DIRNAME, CherryPickResult, ROOT_DIR, Task, WORK_DIRNAME } from './constants.js'
import { debug, error, info } from './logUtils.js'
import { randomBytes } from 'node:crypto'

export const setGlobalGitConfig = async (user: string): Promise<void> => {
	const git = simpleGit()
	await git.addConfig('user.email', `${user}[bot]@users.noreply.github.com`, false, 'global')
	await git.addConfig('user.name', `${user}[bot]`, false, 'global')
	await git.addConfig('commit.gpgsign', 'false', false, 'global')
	await git.addConfig('format.signoff', 'true', false, 'global')
}

/**
 * Clones the repo into the cache dir and then copies it to the work dir.
 * @param owner The owner of the repo.
 * @param repo The name of the repo.
 * @param branch The branch to backport from.
 * @param backportBranch The branch to backport to.
 * @returns The path to the temp repo.
 */
export const cloneAndCacheRepo = async (task: Task, backportBranch: string): Promise<string> => {
	const { owner, repo, branch } = task

	// Clone the repo into the cache dir or make sure it already exists
	const cachedRepoRoot = join(ROOT_DIR, CACHE_DIRNAME, owner, repo)
	try {
		// Create repo path if needed
		if (!existsSync(cachedRepoRoot)) {
			mkdirSync(cachedRepoRoot, { recursive: true })
		}

		const git = simpleGit(cachedRepoRoot)
		if (!existsSync(cachedRepoRoot + '/.git')) {
			// Is not a repository, so clone
			await git.clone(`https://github.com/${owner}/${repo}`, '.')
		} else {
			// Is already a repository so make sure it is clean and follows the default branch
			await git.clean(CleanOptions.FORCE + CleanOptions.IGNORED_ONLY + CleanOptions.RECURSIVE)
			debug(task, `Repo already cached at ${cachedRepoRoot}`)
		}
	} catch (e) {
		throw new Error(`Failed to clone and cache repo: ${e.message}`)
	}

	// Init a new temp repo in the work dir
	const tmpDirName = randomBytes(7).toString('hex')
	const tmpRepoRoot = join(ROOT_DIR, WORK_DIRNAME, tmpDirName)
	try {
		// Copy the cached repo to the temp repo
		mkdirSync(join(ROOT_DIR, WORK_DIRNAME), { recursive: true })

		// create worktree
		const git = simpleGit(cachedRepoRoot)

		// make sure we are on the default branch
		const defaultBranch = (await git.raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).split('origin/').pop() || 'master'
		await git.raw(['checkout', defaultBranch.slice(0, defaultBranch.indexOf("\n")).trim()])

		// fetch upstream version of the branch - well we need to fetch all because we do not know where the commits are located we need to cherry-pick
		await git.fetch(['-p', '--all'])

		// make sure the branch doesn't already exist
		try {
			await git.raw(['worktree', 'prune']);
			await git.deleteLocalBranches([backportBranch], true)
			info(task, `Removed existing worktree for branch ${backportBranch}`)
		} catch (e) {
			error(task, `Failed to remove existing worktree for branch ${backportBranch}: ${e.message}`)
		}
		// create work tree with up-to-date content of that branch
		await git.raw(['worktree', 'add', '-b', backportBranch, tmpRepoRoot, `origin/${branch}`])
	} catch (e) {
		throw new Error(`Failed to create working tree: ${e.message}`)
	}

	return tmpRepoRoot
}

export const cherryPickCommits = async (task: Task, repoRoot: string): Promise<CherryPickResult> => {
	const git = simpleGit(repoRoot)
	let conflicts = false
	let lastValidCommit = ''

	// Cherry pick all the commits
	for (const commit of task.commits) {
		// Cherry picking commit
		try {
			await git.raw(['cherry-pick', commit])
			debug(task, `Cherry picked commit ${commit.slice(0, 8)}`)
			lastValidCommit = commit
			continue
		} catch (e) {
			conflicts = true
			await git.raw(['cherry-pick', '--abort'])
			error(task, `Could not cherry pick commit ${commit.slice(0, 8)}: ${e.message}`)
		}

		// Cherry picking commit while discarding conflicts
		try {
			await git.raw([
				'cherry-pick',
				commit,
				'--strategy-option',
				'ours',
				'--keep-redundant-commits'
			])
			debug(task, `Cherry picked commit ${commit.slice(0, 8)} with conflicts`)
			lastValidCommit = commit
		} catch (e) {
			// This can fail if the commit is empty because all of its
			// files are conflicting. In that case, we can just skip it.
			error(task, `Could not cherry pick commit ${commit.slice(0, 8)} with ours strategy: ${e.message}`)
			await git.raw(['cherry-pick', '--abort'])
		}
	}

	// If there are conflicts, we need to amend the last commit message
	// to add a skip-ci tag so that CI doesn't run on the PR.
	if (conflicts && lastValidCommit !== '') {
		let originalCommitMessage: string|null = null
		try {
			const commitLog = await git.log({
				from: lastValidCommit,
				to: `${lastValidCommit}~1`,
				multiLine: true,
			})
			originalCommitMessage = commitLog?.latest?.body || null

			if (originalCommitMessage !== null) {
				originalCommitMessage += '\n\n[skip ci]'
				// One line per -m flag
				const splitLines = originalCommitMessage.split('\n').map(line => ['-m', line.trim()])
				await git.raw(['commit', '--amend', ...splitLines.flat()])
				debug(task, `Amended commit ${lastValidCommit.slice(0, 8)} message with [skip ci] tag`)
			}
		} catch (e) {
			error(task, `Could not get commit ${lastValidCommit.slice(0, 8)} message from git log`)
		}
	}

	return conflicts ? CherryPickResult.CONFLICTS : CherryPickResult.OK
}

export const pushBranch = async (task: Task, repoRoot: string, token: string, backportBranch: string): Promise<void> => {
	const git = simpleGit(repoRoot)
	git.remote(['set-url', 'origin', `https://x-access-token:${token}@github.com/${task.owner}/${task.repo}.git`])
	await git.raw(['push', 'origin', '--force', backportBranch])
}

export const hasSkipCiCommits = async (repoRoot: string, commits: number): Promise<boolean> => {
	const git = simpleGit(repoRoot)
	const log = await git.log({
		from: `HEAD~${commits}`,
		to: 'HEAD',
		multiLine: true,
	})
	const commitMessages = log.all.map(commit => commit.body)
	return commitMessages.some(message => message.includes('[skip ci]'))
}

export const hasDiff = async (repoRoot: string, base: string, head: string, task: Task): Promise<boolean> => {
	const git = simpleGit(repoRoot)
	const diff = await git.raw(['diff', '--stat', base, head])
	debug(task, `Diff between ${base} and ${head}: ${diff}`)
	return diff !== ''
}

export const hasEmptyCommits = async (repoRoot: string, commits: number, task: Task): Promise<boolean> => {
	let hasEmptyCommits = false
	for (let count = 0; count < commits; count++) {
		if (!await hasDiff(repoRoot, `HEAD~${count}`, `HEAD~${count + 1}`, task)) {
			hasEmptyCommits = true
			break
		}
	}
	return hasEmptyCommits
}

export const getCommitTitle = async (repoRoot: string, commit: string): Promise<string|null> => {
	const git = simpleGit(repoRoot)
	const log = await git.log({
		from: commit,
		to: `${commit}~1`,
		multiLine: true,
	})
	return log.latest?.message || null
}
