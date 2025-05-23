import { existsSync, rmSync } from 'node:fs'
import { Octokit } from '@octokit/rest'

import { cherryPickCommits, cloneAndCacheRepo, getCommitTitle, hasDiff, hasEmptyCommits, hasSkipCiCommits, pushBranch } from './gitUtils.js'
import { CherryPickResult, Task } from './constants.js'
import { debug, error, info, warn } from './logUtils.js'
import { Reaction, addReaction, getAuthToken, getAvailableLabels, getLabelsFromPR, getAvailableMilestones, requestReviewers, getReviewers, createBackportPullRequest, setPRLabels, setPRMilestone, getChangesFromPR, updatePRBody, commentOnPR, assignToPR } from './githubUtils.js'
import { getBackportBody, getFailureCommentBody, getLabelsForPR, getMilestoneFromBase } from './nextcloudUtils.js'

export async function backport(task: Task): Promise<void> {
	const token = await getAuthToken(task.installationId)
	const octokit = new Octokit({ auth: token })

	let tmpDir: string = ''
	let prNumber: number = 0
	let conflicts: CherryPickResult|null = null
	const backportBranch = `backport/${task.prNumber}/${task.branch}`

	info(task, `Starting backport request`)

	// Add a reaction to the comment to indicate that we're processing it
	try {
		await addReaction(octokit, task, Reaction.THUMBS_UP)
	} catch (e) {
		error(task, `Failed to add reaction to PR: ${e.message}`)
		// continue, this is not a fatal error
	}

	try {
		// Clone and cache the repo
		try {
			tmpDir = await cloneAndCacheRepo(task, backportBranch)
			info(task, `Cloned to ${tmpDir}`)
		} catch (e) {
			throw new Error(`Failed to clone repository: ${e.message}`)
		}

		// Cherry pick the commits
		try {
			conflicts = await cherryPickCommits(task, tmpDir)
			if (conflicts === CherryPickResult.CONFLICTS) {
				warn(task, `Cherry picking commits resulted in conflicts`)
			} else {
				info(task, `Cherry picking commits successful`)
			}
		} catch (e) {
			throw new Error(`Failed to cherry pick commits: ${e.message}`)
		}

		try {
			// Check if there are any changes to backport
			const hasChanges = await hasDiff(tmpDir, `origin/${task.branch}`, backportBranch, task)
			if (!hasChanges) {
				throw new Error(`No changes found in backport branch`)
			}
		} catch (e) {
			throw new Error(`Failed to check for changes with origin/${task.branch}: ${e.message}`)
		}

		// Push the branch
		try {
			await pushBranch(task, tmpDir, token, backportBranch)
			info(task, `Pushed branch ${backportBranch}`)
		} catch (e) {
			throw new Error(`Failed to push branch ${backportBranch}: ${e.message}`)
		}

		// If only one commit, we use it as the PR title
		if (!task.isFullRequest && task.commits.length === 1) {
			const oldTitle = task.prTitle
			task.prTitle = await getCommitTitle(tmpDir, task.commits[0]) || task.prTitle
			if (oldTitle !== task.prTitle) {
				info(task, `Using commit title as PR title: ${task.prTitle}`)
			} else {
				error(task, `Failed to get commit title`)
			}
		} 

		// Create the pull request
		try {
			const reviewers = await getReviewers(octokit, task)
			const prCreationResult = await createBackportPullRequest(octokit, task, backportBranch, conflicts === CherryPickResult.CONFLICTS)
			prNumber = prCreationResult.data.number
			info(task, `Opened Pull Request #${prNumber} on ${prCreationResult.data.html_url}`)

			try {
				// Ask for reviews from all reviewers of the original PR
				if (reviewers.length !== 0) {
					await requestReviewers(octokit, task, prNumber, reviewers)
				}

				// Also ask the author of the original PR for a review
				await requestReviewers(octokit, task, prNumber, [task.author])
				info(task, `Requested reviews from ${[...reviewers, task.author].join(', ')}`)
			} catch (e) {
				error(task, `Failed to request reviews: ${e.message}`)
			}
		} catch (e) {
			throw new Error(`Failed to create pull request: ${e.message}`)
		}

		// Get labels from original PR and set them on the new PR
		try {
			const availableLabels = await getAvailableLabels(octokit, task)
			const prLabels = await getLabelsFromPR(octokit, task)
			const labels = getLabelsForPR(prLabels, availableLabels)
			await setPRLabels(octokit, task, prNumber, labels)
			info(task, `Set labels: ${labels.join(', ')}`)
		} catch (e) {
			error(task, `Failed to get and set labels: ${e.message}`)
			// continue, this is not a fatal error
		}

		// Find new appropriate Milestone and set it on the new PR
		try {
			const availableMilestone = await getAvailableMilestones(octokit, task)
			const milestone = await getMilestoneFromBase(task.branch, availableMilestone)
			await setPRMilestone(octokit, task, prNumber, milestone)
			info(task, `Set milestone: ${milestone.title}`)
		} catch (e) {
			error(task, `Failed to find appropriate milestone: ${e.message}`)
			// continue, this is not a fatal error
		}

		// Assign the PR to the author of the original PR
		try {
			await assignToPR(octokit, task, prNumber, [task.author])
			info(task, `Assigned original author: ${task.author}`)
		} catch (e) {
			error(task, `Failed to assign PR: ${e.message}`)
			// continue, this is not a fatal error
		}

		// Compare the original PR with the new PR
		try {
			const oldChanges = await getChangesFromPR(octokit, task, task.prNumber)
			const newChanges = await getChangesFromPR(octokit, task, prNumber)
			const diffChanges = oldChanges.additions !== newChanges.additions
				|| oldChanges.deletions !== newChanges.deletions
				|| oldChanges.changedFiles !== newChanges.changedFiles
			const skipCi = await hasSkipCiCommits(tmpDir, task.commits.length)
			const emptyCommits = await hasEmptyCommits(tmpDir, task.commits.length, task)
			const hasConflicts = conflicts === CherryPickResult.CONFLICTS

			debug(task, `hasConflicts: ${hasConflicts}, diffChanges: ${diffChanges}, emptyCommits: ${emptyCommits}, skipCi: ${skipCi}`)
			try {
				if (hasConflicts || diffChanges || emptyCommits || skipCi) {
					const newBody = await getBackportBody(task.prNumber, hasConflicts, diffChanges, emptyCommits, skipCi, task.isFullRequest)
					await updatePRBody(octokit, task, prNumber, newBody)
				}
			} catch (e) {
				error(task, `Failed to update PR body: ${e.message}`)
				// continue, this is not a fatal error
			}
		} catch (e) {
			error(task, `Failed to compare changes: ${e.message}`)
			// continue, this is not a fatal error
		}

		// Success! We're done here
		addReaction(octokit, task, Reaction.HOORAY)
	} catch (e) {
		// Add a thumbs down reaction to the comment to indicate that we failed
		try {
			addReaction(octokit, task, Reaction.THUMBS_DOWN)
			const failureComment = getFailureCommentBody(task, backportBranch, e?.message)
			await commentOnPR(octokit, task, failureComment)
			error(task, `Something went wrong during the backport process: ${e?.message}`)
			console.trace()
		} catch (e) {
			error(task, `Failed to comment failure on PR: ${e.message}`)
			// continue, this is not a fatal error
		}

		throw new Error(`Failed to backport: ${e.message}`)
	} finally {
		// Remove the temp dir if it exists
		if (tmpDir !== '' && existsSync(tmpDir)) {
			try {
				rmSync(tmpDir, { recursive: true })
				info(task, `Removed ${tmpDir}`)
			} catch (e) {
				error(task, `Failed to remove ${tmpDir}: ${e.message}`)
			}
		}
	}
}
