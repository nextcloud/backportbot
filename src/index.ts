import { createNodeMiddleware } from '@octokit/webhooks'
import { createServer } from 'http'
import { info, error } from 'node:console'
import { Octokit } from '@octokit/rest'

import { addToQueue } from './queue'
import { CACHE_DIRNAME, COMMAND_PREFIX, LABEL_BACKPORT, PRIVATE_KEY_PATH, ROOT_DIR, SERVE_HOST, SERVE_PORT, TO_SEPARATOR, Task, WEBHOOK_SECRET } from './constants'
import { extractBranchFromPayload, extractCommitsFromPayload } from './payloadUtils'
import { getApp } from './appUtils'
import { Reaction, addPRLabel, addReaction, getAuthToken, getBackportRequestsFromPR, getCommitsForPR, removePRLabel } from './githubUtils'
import { setGlobalGitConfig } from './gitUtils'

const app = getApp()

app.webhooks.onError(err => {
	error(`Error occurred in ${err.event.name}: ${err.message}`)
})

app.webhooks.on(['pull_request.closed'], async ({ payload }) => {
	const installationId = payload?.installation?.id as number
	const owner = payload.repository.owner.login
	const repo = payload.repository.name
	const htmlUrl = payload.pull_request.html_url

	if (owner !== 'nextcloud' && owner !== 'skjnldsv') {
		info(`Ignoring ${htmlUrl} from ${owner}`)
		return
	}

	const authOctokit = new Octokit({ auth: await getAuthToken(installationId) })

	const author = payload.pull_request?.user?.login || ''
	const prNumber = payload.pull_request?.number
	const prTitle = payload.pull_request?.title || `Backport of PR #${prNumber}`

	// Check if valid PR
	const isMerged = payload?.pull_request?.merged === true
	if (!isMerged) {
		info(`Ignoring closed but unmerged PR ${htmlUrl}`)
		return
	}

	// Check if PR has backport requests
	const comments = await (await getBackportRequestsFromPR(authOctokit, { owner, repo, prNumber: payload.number } as Task)).reverse()
	if (comments.length === 0) {
		info(`Closed PR ${htmlUrl} have no backport requests, skipping`)
		return
	}

	info(`\nReceived merged PR ${htmlUrl}`)
	info(`├ Repo: ${owner}/${repo}`)
	info(`├ Author: ${author}`)

	// We will ignore duplicate requests to the same branch
	const processedBranches = new Set<string>()
	const tasksToProcess: Task[] = []

	// Process each comment
	for(const { id, body } of comments) {
		try {
			let branch: string
			let commits: string[] = []
		
			// Extract the commits and branch from the payload
			try {
				commits = extractCommitsFromPayload(body)
				branch = extractBranchFromPayload(body)
			} catch (e) {
				// Add a confused reaction to the comment to indicate that we failed to understand it
				addReaction(authOctokit, { owner, repo, commentId: id } as Task, Reaction.CONFUSED)
				error(`├ Failed to extract commits and branch from payload: \`${body}\``)
				continue
			}

			if (processedBranches.has(branch)) {
				info(`├ Skipping duplicate backport request to \`${branch}\``)
				continue
			}

			const isFullRequest = body.trim().startsWith(COMMAND_PREFIX + TO_SEPARATOR)
			if (isFullRequest) {
				commits = await getCommitsForPR(authOctokit, owner, repo, prNumber)
				info(`├ Full backport request to \`${branch}\` with ${commits.length} commits`)
			} else {
				info(`├ Partial backport request to \`${branch}\` with ${commits.length} commits`)
			}

			const task = {
				owner,
				repo,
				branch,
				commits,
				prNumber,
				prTitle,
				commentId: id,
				installationId,
				author,
			} as Task

			processedBranches.add(branch)
			tasksToProcess.push(task)
		} catch (e) {
			error(`├ Failed to handle \`${body}\` request: ${e.message}`)
		}
	}

	// Process the tasks
	const tasks = tasksToProcess.map(task => addToQueue(task))
	Promise.allSettled(tasks).then(async results => {
		const hasFailedTasks = results.some(result => result.status === 'rejected')

		// Remove the backport label from the PR if all succeeded
		if (!hasFailedTasks) {
			try {
				await removePRLabel(authOctokit, { owner, repo } as Task, prNumber, LABEL_BACKPORT)
			} catch (e) {
				error(`\nFailed to remove backport label from PR ${htmlUrl}: ${e.message}`)
			}
		}
	})

	info(`├ Total backport requests: ${comments.length}`)
	info(`└ Handled backport requests: ${processedBranches.size}`)
})

app.webhooks.on(['issue_comment.created'], async ({ payload }) => {
	const installationId = payload?.installation?.id as number
	const owner = payload.repository.owner.login
	const repo = payload.repository.name
	const htmlUrl = payload.issue.html_url

	if (owner !== 'nextcloud' && owner !== 'skjnldsv') {
		info(`Ignoring ${htmlUrl} from ${owner}`)
		return
	}

	const commentId = payload?.comment?.id as number
	const body = payload?.comment?.body || ''

	const author = payload.issue?.user?.login || ''
	const prNumber = payload.issue?.number
	const prTitle = payload.issue?.title || `Backport of PR #${prNumber}`

	const authOctokit = new Octokit({ auth: await getAuthToken(installationId) })

	// Ignoring comments on issues that are not PRs
	if (!payload?.issue?.pull_request) {
		return
	}

	// Check if the comment is a backport request
	if (body.trim().startsWith(COMMAND_PREFIX)) {
		// Check if the author is at least a collaborator
		const commentAuthor = payload?.comment?.user.login
		const authorAssociation = payload?.comment?.author_association
		if (!authorAssociation || authorAssociation === 'NONE') {
			info(`Ignoring comment from non-collaborator: ${commentAuthor}}`)
			return
		}

		let branch: string
		let commits: string[] = []

		const isFullRequest = body.trim().startsWith(COMMAND_PREFIX + TO_SEPARATOR)
		const isClosed = payload.issue?.state === 'closed'
		const isMerged = typeof payload.issue?.pull_request?.merged_at === 'string'

		if (isClosed && !isMerged) {
			addReaction(authOctokit, { owner, repo, commentId } as Task, Reaction.THUMBS_DOWN)
			error(`Ignoring comment on closed but unmerged PR ${htmlUrl}`)
			return
		}

		// Extract the commits and branch from the payload
		try {
			commits = extractCommitsFromPayload(body)
			branch = extractBranchFromPayload(body)
		} catch (e) {
			// Add a confused reaction to the comment to indicate that we failed to understand it
			addReaction(authOctokit, { owner, repo, commentId } as Task, Reaction.CONFUSED)
			error(`Failed to extract commits and branch from payload: \`${body}\` on ${htmlUrl}`)
			return
		}

		// Start processing the request
		try {
			// If we have no commits, and the request did specify some commits
			// then something went wrong.
			// /backport `5e83e97 to stable28` means we backport 5e83e97 to stable28
			// /backport to stable28 means we backport all commits from this PR to stable28
			if (commits.length === 0 && !isFullRequest) {
				throw new Error('No commits found in payload')
			}

			if (isFullRequest) {
				info(`\nReceived full backport request to \`${branch}\``)
				info(`├ Fetching commits from PR ${htmlUrl}...`)
				commits = await getCommitsForPR(authOctokit, owner, repo, prNumber)
			} else {
				info(`\nReceived partial backport request to \`${branch}\``)
			}

			// PR info
			if (isMerged) {
				info(`├ PR is merged, starting backport right away`)
			} else {
				info(`├ PR is not merged yet, waiting for merge`)
				addReaction(authOctokit, { owner, repo, commentId } as Task, Reaction.EYES)
			}

			info(`├ Repo: ${owner}/${repo}`)
			info(`├ Author: ${author}`)
			info(`└ Commits: ${commits.join(' ')}`)

			const task = {
				owner,
				repo,
				branch,
				commits,
				prNumber,
				prTitle,
				commentId,
				installationId,
				author,
			} as Task

			// Add the backport label to the PR
			try {
				await addPRLabel(authOctokit, task, prNumber, LABEL_BACKPORT)
			} catch (e) {
				error(`Failed to set labels on PR: ${e.message}`)
			}

			// If the PR is already merged, we can start the backport right away
			if (isMerged) {
				try {
					await addToQueue(task)
					// Remove the backport label from the PR on success
					try {
						await removePRLabel(authOctokit, task, prNumber, LABEL_BACKPORT)
					} catch (e) {
						error(`\nFailed to remove backport label from PR ${htmlUrl}: ${e.message}`)
					}
				} catch (e) {
					// Safely ignore
				}
			}
		} catch (e) {
			// This should really not happen, but if it does, we want to know about it
			if (e instanceof Error) {
				addReaction(authOctokit, { owner, repo, commentId } as Task, Reaction.THUMBS_DOWN)
				error(`Failed to handle backport request: ${e.message}`)
				return
			}
			error('Failed to handle backport request, unknown error')
		}
	}
})

app.octokit.request('/app').then(async ({data}) => {
	if (!data.events.includes('pull_request') || !data.events.includes('issue_comment')) {
		error(`The app is not subscribed to the required events.
You need to subscribe to \`pull_request\` AND \`issue_comment\` events.
Subscribed events: ${data.events}`)
		process.exit(1)
	}

	await setGlobalGitConfig(data.name)

	const obfuscatedWebhookSecret = WEBHOOK_SECRET.slice(0, 8) + '*'.repeat(WEBHOOK_SECRET.length - 8)
	info(`Listening on ${SERVE_HOST}:${SERVE_PORT}`)
	info(`├ Authenticated as ${data.name}`)
	info(`├ Monitoring events`, data.events)
	info(`├ Command prefix: ${COMMAND_PREFIX}`)
	info(`├ Root dir: ${ROOT_DIR}`)
	info(`├ Cache dir: ${ROOT_DIR}/${CACHE_DIRNAME}`)
	info(`├ Private key in ${PRIVATE_KEY_PATH}`)
	info(`└ Webhook secret is ${obfuscatedWebhookSecret}`)
	createServer(createNodeMiddleware(app.webhooks)).listen(SERVE_PORT, SERVE_HOST)
})
