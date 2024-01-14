import { existsSync, rmSync } from 'node:fs'
import { Octokit } from '@octokit/rest'

import { cherryPickCommits, cloneAndCacheRepo, hasEmptyCommits, hasSkipCiCommits, pushBranch } from './gitUtils'
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
				reject(`Failed to clone repository: ${e.message}`)
				throw e
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
				reject(`Failed to cherry pick commits: ${e.message}`)
				throw e
			}

			// Push the branch
			try {
				await pushBranch(task, tmpDir, token)
				info(task, `Pushed branch ${backportBranch}`)
			} catch (e) {
				reject(`Failed to push branch: ${e.message}`)
				throw e
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
					reject(`Failed to request reviews: ${e.message}`)
				}
			} catch (e) {
				reject(`Failed to create pull request: ${e.message}`)
				throw e
			}

			// Get labels from original PR and set them on the new PR
			try {
				const availableLabels = await getAvailableLabels(octokit, task)
				const prLabels = await getLabelsFromPR(octokit, task)
				const labels = getLabelsForPR(prLabels, availableLabels)
				await setPRLabels(octokit, task, prNumber, labels)
				info(task, `Set labels: ${labels.join(', ')}`)
			} catch (e) {
				reject(`Failed to get labels: ${e.message}`)
			}

			// Find new appropriate Milestone and set it on the new PR
			try {
				const availableMilestone = await getAvailableMilestones(octokit, task)
				const milestone = await getMilestoneFromBase(task.branch, availableMilestone)
				await setPRMilestone(octokit, task, prNumber, milestone)
				info(task, `Set milestone: ${milestone.title}`)
			} catch (e) {
				warn(task, `Failed to find appropriate milestone: ${e.message}`)
			}

			// Assign the PR to the author of the original PR
			try {
				await assignToPR(octokit, task, prNumber, [task.author])
				info(task, `Assigned original author: ${task.author}`)
			} catch (e) {
				reject(`Failed to assign PR: ${e.message}`)
			}

			// Compare the original PR with the new PR
			try {
				const oldChanges = await getChangesFromPR(octokit, task, task.prNumber)
				const newChanges = await getChangesFromPR(octokit, task, prNumber)
				const diffChanges = oldChanges.additions !== newChanges.additions
					|| oldChanges.deletions !== newChanges.deletions
					|| oldChanges.changedFiles !== newChanges.changedFiles
				const skipCi = await hasSkipCiCommits(tmpDir, task.commits.length)
				const emptyCommits = await hasEmptyCommits(tmpDir, task.commits.length)
				const hasConflicts = conflicts === CherryPickResult.CONFLICTS

				debug(task, `hasConflicts: ${hasConflicts}, diffChanges: ${diffChanges}, emptyCommits: ${emptyCommits}, skipCi: ${skipCi}`)
				try {
					if (hasConflicts || diffChanges || emptyCommits || skipCi) {
						const newBody = await getBackportBody(task.prNumber, hasConflicts, diffChanges, emptyCommits, skipCi)
						await updatePRBody(octokit, task, prNumber, newBody)
					}
				} catch (e) {
					reject(`Failed to update PR body: ${e.message}`)
				}
			} catch (e) {
				reject(`Failed to compare changes: ${e.message}`)
			}

			// Success! We're done here
			addReaction(octokit, task, Reaction.HOORAY)
		} catch (e) {
			// Add a thumbs down reaction to the comment to indicate that we failed
			addReaction(octokit, task, Reaction.THUMBS_DOWN)
			try {
				const failureComment = getFailureCommentBody(task, backportBranch, e?.message)
				await commentOnPR(octokit, task, failureComment)
			} catch (e) {
				reject(`Failed to comment failure on PR: ${e.message}`)
			}
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
