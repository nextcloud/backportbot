import { Octokit } from '@octokit/rest'
import { getApp } from './appUtils'
import { AuthResponse, COMMAND_PREFIX, PRChanges, Task } from './constants'
import { IssueComment, Milestone } from '@octokit/webhooks-types'

export enum Reaction {
	THUMBS_UP = '+1',
	THUMBS_DOWN = '-1',
	LAUGH = 'laugh',
	CONFUSED = 'confused',
	HEART = 'heart',
	HOORAY = 'hooray',
	ROCKET = 'rocket',
	EYES = 'eyes',
}

export const getAuthToken = async (installationId: number): Promise<string> => {
	const app = getApp()
	const { token } = await app.octokit.auth({ type: 'installation', installationId }) as AuthResponse
	return token
}

export const getCommitsForPR = async (octokit: Octokit, owner: string, repo: string, pr: number): Promise<string[]> => {
	const { data: commits } = await octokit.rest.pulls.listCommits({
		owner,
		repo,
		pull_number: pr,
	})
	return commits.map(commit => commit.sha)
}

export const addReaction = async (octokit: Octokit, task: Task, reaction: Reaction): Promise<void> => {
	const { owner, repo, commentId } = task
	await octokit.rest.reactions.createForIssueComment({
		owner,
		repo,
		comment_id: commentId,
		content: reaction,
	})
}

export const getReviewers = async function (octokit: Octokit, task: Task): Promise<string[]> {
	const { owner, repo, prNumber } = task
	const reviews = await octokit.pulls.listReviews({
		owner,
		repo,
		pull_number: prNumber
	})

	// Filter non collaborators and non approved reviews
	// Then map to usernames and remove invalid values
	const reviewers = reviews.data
		.filter(review => review.state === 'APPROVED')
		.filter(reviewer => reviewer.author_association !== 'NONE')
		.map(reviewer => reviewer?.user?.login)
		.filter(Boolean) as string[]
	
	// Remove duplicates
	return [...new Set(reviewers)]
}

export const requestReviewers = async function (octokit: Octokit, task: Task, prNumber: number, reviewers: string[]) {
	const { owner, repo } = task
	return octokit.pulls.requestReviewers({
		owner,
		repo,
		pull_number: prNumber,
		reviewers
	})
}

export const createBackportPullRequest = async (octokit: Octokit, task: Task, head: string, conflicts = false) => {
	const { owner, repo, branch, prNumber, prTitle } = task

	return await octokit.rest.pulls.create({
		owner,
		repo,
		head,
		base: branch,
		body: `Backport of PR #${prNumber}`,
		title: `[${branch}] ${prTitle}`,
		draft: conflicts,
		maintainer_can_modify: true,
	})
}

export const updatePRBody = async (octokit: Octokit, task: Task, prNumber: number, body: string) => {
	const { owner, repo } = task
	return octokit.rest.pulls.update({
		owner,
		repo,
		pull_number: prNumber,
		body,
	})
}

export const getAvailableMilestones = async (octokit: Octokit, task: Task): Promise<Milestone[]> => {
	const { owner, repo } = task
	const { data } = await octokit.rest.issues.listMilestones({
		owner,
		repo,
		state: 'open',
	})

	return data as Milestone[]
}

export const getAvailableLabels = async (octokit: Octokit, task: Task): Promise<string[]> => {
	const { owner, repo } = task
	const labels = await octokit.rest.issues.listLabelsForRepo({
		owner,
		repo,
	})

	return labels.data.map(label => label.name)
}

export const getLabelsFromPR = async (octokit: Octokit, task: Task): Promise<string[]> => {
	const { owner, repo, prNumber } = task
	const labels = await octokit.rest.issues.listLabelsOnIssue({
		owner,
		repo,
		issue_number: prNumber,
	})

	return labels.data.map(label => label.name)
}

export const setPRLabels = async (octokit: Octokit, task: Task, prNumber: number, labels: string[]) => {
	const { owner, repo } = task
	return octokit.issues.update({
		owner,
		repo,
		issue_number: prNumber,
		labels
	})
}

export const addPRLabel = async (octokit: Octokit, task: Task, prNumber: number, label: string) => {
	const { owner, repo } = task
	return octokit.issues.addLabels({
		owner,
		repo,
		issue_number: prNumber,
		labels: [label]
	})
}

export const removePRLabel = async (octokit: Octokit, task: Task, prNumber: number, label: string) => {
	const { owner, repo } = task
	return octokit.issues.removeLabel({
		owner,
		repo,
		issue_number: prNumber,
		name: label
	})
}

export const assignToPR = async (octokit: Octokit, task: Task, prNumber: number, assignees: string[]) => {
	const { owner, repo } = task
	return octokit.issues.addAssignees({
		owner,
		repo,
		issue_number: prNumber,
		assignees
	})
}

export const setPRMilestone = async (octokit: Octokit, task: Task, prNumber: number, milestone: Milestone) => {
	const { owner, repo } = task
	return octokit.issues.update({
		owner,
		repo,
		issue_number: prNumber,
		milestone: milestone.number
	})
}

export const getChangesFromPR = async (octokit: Octokit, task: Task, prNumber: number): Promise<PRChanges> => {
	const { owner, repo } = task

	const { data } = await octokit.rest.pulls.get({
		owner,
		repo,
		pull_number: prNumber,
	})

	return {
		additions: data.additions,
		deletions: data.deletions,
		changedFiles: data.changed_files,
	} as PRChanges
}

export const commentOnPR = async (octokit: Octokit, task: Task, body: string) => {
	const { owner, repo, prNumber } = task
	return octokit.rest.issues.createComment({
		owner,
		repo,
		issue_number: prNumber,
		body,
	})
}

export const getBackportRequestsFromPR = async (octokit: Octokit, task: Task): Promise<IssueComment[]> => {
	const { owner, repo, prNumber } = task
	const { data } = await octokit.rest.issues.listComments({
		owner,
		repo,
		issue_number: prNumber,
	})

	return data
		// Filter out invalid comments
		.filter(comment => comment?.body?.trim().startsWith(COMMAND_PREFIX))
		// Filter out comments from non-collaborators
		.filter(comment => comment?.author_association !== 'NONE')
		// Filter out comments that got rejected by the bot.
		// This is a safety measure, we will check the command again
		.filter(comment => comment.reactions?.confused === 0) as IssueComment[]
}
