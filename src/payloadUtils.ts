import { BRANCH_REGEX, COMMAND_PREFIX, COMMIT_REGEX, TO_SEPARATOR } from './constants'

/**
 * Extracts the commits from the payload.
 * @param payload The payload from the webhook. e.g. `/backport 5e83e97 to stable28`
 * @returns The list of commits.
 */
export const extractCommitsFromPayload = (payload: string): string[] => {
	try {
		const commitsChain = payload.split(TO_SEPARATOR)[0].slice(COMMAND_PREFIX.length).trim()

		// Split and remove the force flag if present
		const commits = commitsChain.split(' ').filter(str => !str.startsWith('!'))
		if (commitsChain !== '' && commits.some(commit => !COMMIT_REGEX.test(commit))) {
			throw new Error(`Invalid commit(s) found in payload: ${commitsChain}`)
		}

		return commits.filter(commit => COMMIT_REGEX.test(commit))
	} catch (e) {
		throw new Error(`Failed to extract commits from payload: \`${payload}\``)
	}
}

export const extractBranchFromPayload = (payload: string): string => {
	const firstLine = payload.split('\n')[0]
	const branch = firstLine.split(TO_SEPARATOR)[1]?.trim?.() ?? ''

	// Check if the branch matches the regex
	if (!BRANCH_REGEX.test(branch)) {
		throw new Error(`Branch name \`${branch}\` is invalid`)
	}
	return branch
}

export const isFriendly = (payload: string): boolean => {
	return payload.endsWith('please')
}
