import { join, resolve } from 'node:path'

export const SERVE_PORT = process.env.SERVE_PORT || 3000
export const SERVE_HOST = process.env.SERVE_HOST || '0.0.0.0'

export const ROOT_DIR = resolve(__dirname + '/../')
export const CACHE_DIRNAME = 'cache' // relative to the root dir
export const WORK_DIRNAME = 'work' // relative to the root dir

export const APP_ID = process.env.APP_ID || 0
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
export const PRIVATE_KEY_FILENAME = 'private-key.pem'
export const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || join(ROOT_DIR, PRIVATE_KEY_FILENAME)

export const LOG_FILE = 'backport.log'

export const COMMAND_PREFIX = '/backport'
export const TO_SEPARATOR = ' to '
export const COMMIT_REGEX = /^\b[0-9a-f]{7,40}$\b/i
export const BRANCH_REGEX = /^\b[a-z0-9-_./]{1,100}\b$/i

export const LABEL_BACKPORT = 'backport-request'
export const LABEL_TO_REVIEW = '3. to review'

export const STEP_REVIEW_CONFLICTS = 'Review and resolve any conflicts'
export const STEP_REMOVE_EMPTY_COMMITS = 'Remove all the empty commits'
export const STEP_AMEND_SKIP_CI = 'Amend HEAD commit to remove `[skip ci]` tag'

export const WARN_CONFLICTS = 'This backport had conflicts that were resolved with the `ours` merge strategy and is likely incomplete ⚠️'
export const WARN_DIFF = 'This backport\'s changes differ from the original and might be incomplete ⚠️'

export const LEARN_MORE = `\n---\n\nLearn more about backports at https://docs.nextcloud.com/server/stable/go.php?to=developer-backports.`

export type Task = {
	installationId: number
	owner: string
	repo: string
	branch: string
	commits: string[]
	prNumber: number
	prTitle: string
	commentId: number
	author: string
}

export enum CherryPickResult {
	OK,
	CONFLICTS,
}


export type AuthResponse = {
	type: 'token',
	tokenType: 'installation',
	token: string,
	installationId: number,
	permissions: {
		contents: string,
		issues: string,
		metadata: string,
		pull_requests: string,
	},
	createdAt: Date,
	expiresAt: Date,
	repositorySelection: string,
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export type PRChanges = {
	additions: number,
	deletions: number,
	changedFiles: number,
}
