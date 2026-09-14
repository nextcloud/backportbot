import {
	BRANCH_REGEX,
	COMMAND_PREFIX,
	COMMIT_REGEX,
	MAX_BRANCHES_PER_REQUEST,
	STABLE_BRANCH_RANGE_REGEX,
	TO_SEPARATOR,
	BackportRequest,
} from './constants'

const getFirstLine = (payload: string): string => {
	return payload.split('\n')[0].trim()
}

const parseCommits = (value: string): string[] => {
	if (value === '') {
		return []
	}

	const commits = value
		.split(/\s+/)
		.filter(Boolean)

	if (commits.some(commit => !COMMIT_REGEX.test(commit))) {
		throw new Error(`Invalid commit(s) found in payload: ${value}`)
	}

	return commits
}

const expandBranches = (value: string): string[] => {
	const range = value.match(STABLE_BRANCH_RANGE_REGEX)

	if (range) {
		if (
			(range[1].length > 1 && range[1].startsWith('0')) ||
			(range[2].length > 1 && range[2].startsWith('0'))
		) {
			throw new Error(`Stable branch numbers must not contain leading zeroes: \`${value}\``)
		}
	
		const start = Number(range[1])
		const end = Number(range[2])

		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
			throw new Error(`Branch range numbers are too large: \`${value}\``)
		}

		if (start > end) {
			throw new Error(`Branch range must be ascending: \`${value}\``)
		}

		const count = end - start + 1

		if (count > MAX_BRANCHES_PER_REQUEST) {
			throw new Error(
				`Branch range contains ${count} branches, maximum is ${MAX_BRANCHES_PER_REQUEST}`,
			)
		}

		return Array.from(
			{ length: count },
			(_, index) => `stable${start + index}`,
		)
	}

	if (!BRANCH_REGEX.test(value)) {
		throw new Error(`Branch name \`${value}\` is invalid`)
	}

	return [value]
}

export const parseBackportRequest = (payload: string): BackportRequest => {
	const firstLine = getFirstLine(payload)
	const isForced = firstLine.startsWith(`${COMMAND_PREFIX}!`)
	const prefix = isForced ? `${COMMAND_PREFIX}!` : COMMAND_PREFIX

	if (!firstLine.startsWith(prefix)) {
		throw new Error(`Invalid backport command: \`${payload}\``)
	}

	const isFriendly = /\s+please$/i.test(firstLine)
	const command = firstLine
		.slice(prefix.length)
		.replace(/\s+please$/i, '')
		.trim()

	const separatorIndex = command.indexOf(TO_SEPARATOR)
	if (separatorIndex === -1) {
		throw new Error(`Missing branch target in payload: \`${payload}\``)
	}

	const commitsPart = command.slice(0, separatorIndex).trim()
	const branchesPart = command
		.slice(separatorIndex + TO_SEPARATOR.length)
		.trim()

	if (branchesPart === '') {
		throw new Error(`Branch name is missing in payload: \`${payload}\``)
	}

	const commits = parseCommits(commitsPart)
	const branches = expandBranches(branchesPart)

	return {
		commits,
		branches,
		isForced,
		isFullRequest: commits.length === 0,
		isFriendly,
	}
}
