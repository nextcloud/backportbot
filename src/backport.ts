import { existsSync, rmSync } from 'node:fs'
import { Octokit } from '@octokit/rest'

import { cherryPickCommits, cloneAndCacheRepo, hasDiff, hasEmptyCommits, hasSkipCiCommits, pushBranch } from './gitUtils'
import { CherryPickResult, Task } from './constants'
import { debug, error, info, warn } from './logUtils'
import { Reaction, addReaction, getAuthToken, getAvailableLabels, getLabelsFromPR, getAvailableMilestones, requestReviewers, getReviewers, createBackportPullRequest, setPRLabels, setPRMilestone, getChangesFromPR, updatePRBody, commentOnPR, assignToPR } from './githubUtils'
import { getBackportBody, getFailureCommentBody, getLabelsForPR, getMilestoneFromBase } from './nextcloudUtils'

export const backport = (task: Task) => new Promise<void>((resolve, reject) => {
	getAuthToken(task.installationId).then(async token => {
		const octokit = new Octokit({ auth: token })

		let tmpDir: string = ''
		let prNumber: number = 0
		let conflicts: CherryPickResult|null = null
		const backportBranch = `backport/${task.prNumber}/${task.branch}`

		info(task, `Starting backport request`)

		// Add a reaction to the comment to indicate that we're processing it
		addReaction(octokit, task, Reaction.THUMBS_UP)

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

			// Check if there are any changes to backport
			const hasChanges = await hasDiff(tmpDir, task.branch, backportBranch, task)
			if (!hasChanges) {
				throw new Error(`No changes found in backport branch`)
			}

			// Push the branch
			try {
				await pushBranch(task, tmpDir, token, backportBranch)
				info(task, `Pushed branch ${backportBranch}`)
			} catch (e) {
				throw new Error(`Failed to push branch ${backportBranch}: ${e.message}`)
			}

			// Create the pull request
			try {
				const reviewers = await getReviewers(octokit, task)
				const prCreationResult = await createBackportPullRequest(octokit, task, backportBranch, conflicts === CherryPickResult.CONFLICTS)
				prNumber = prCreationResult.data.number
				info(task, `Opened Pull Request #${prNumber} on ${prCreationResult.data.html_url}`)
				addReaction(octokit, task, Reaction.THUMBS_UP)

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
						const newBody = await getBackportBody(task.prNumber, hasConflicts, diffChanges, emptyCommits, skipCi)
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
			} catch (e) {
				error(task, `Failed to comment failure on PR: ${e.message}`)
				// continue, this is not a fatal error
			}

			reject(`Failed to backport: ${e.message}`)
		}

		// Remove the temp dir if it exists
		if (tmpDir !== '' && existsSync(tmpDir)) {
			try {
				rmSync(tmpDir, { recursive: true })
				info(task, `Removed ${tmpDir}`)
				resolve()
			} catch (e) {
				reject(`Failed to remove ${tmpDir}: ${e.message}`)
			}
		}
	})
}).catch(e => {
	error(task, e)
	throw e
})
