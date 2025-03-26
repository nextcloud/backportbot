import { Milestone } from '@octokit/webhooks-types'
import { LABEL_BACKPORT, LABEL_TO_REVIEW, LEARN_MORE, STEP_AMEND_SKIP_CI, STEP_REMOVE_EMPTY_COMMITS, STEP_REVIEW_CONFLICTS, Task, WARN_CONFLICTS, WARN_DIFF } from './constants'

const compareSemanticVersions = (a: string, b: string) => {
	// 1. Split the strings into their parts.
	const a1 = a.split('.')
	const b1 = b.split('.')

	// 2. Contingency in case there's a 4th or 5th version
	const len = Math.min(a1.length, b1.length)

	// 3. Look through each version number and compare.
	for (let i = 0; i < len; i++) {
		const a2 = +a1[ i ] || 0
		const b2 = +b1[ i ] || 0
		
		if (a2 !== b2) {
			return a2 > b2 ? 1 : -1
		}
	}
	
	// 4. We hit this if the all checked versions so far are equal
	return b1.length - a1.length
}

export const getMilestoneFromBase = (branch: string, milestones: Milestone[]): Milestone => {
	// Extract the version from the branch name, e.g. stable21
	const version = branch.match(/^\D+([\d.]+)/i)?.[1]
	if (!version) {
		throw new Error(`Could not extract version from branch \`${branch}\``)
	}
	const selection = milestones
		.filter(milestone => milestone.title.includes(version))
		.sort((a, b) => compareSemanticVersions(a.title, b.title))
	return selection[0]
}

export const getLabelsForPR = (labels: string[], repoLabels: string[]): string[] => {
	const results: string[] = []

	// If the repo have the to-review kanban label, add it to the PR
	if (repoLabels.includes(LABEL_TO_REVIEW)) {
		results.push(LABEL_TO_REVIEW)
	}

	results.push(
		...labels
			// Filter out the backport label
			.filter(label => label !== LABEL_BACKPORT)
			// Filter out kanban labels
			.filter(label => label.match(/^\d\./) === null)
	)

	return [...new Set(results)] // Remove duplicates
}

export const getBackportBody = (prNumber: number, hasConflicts: boolean, hasDiff: boolean, hasEmptyCommits: boolean, hasSkipCiCommits: boolean, isFullRequest = false) => {
	const steps: string[] = []
	let warning: string = ''

	if (hasConflicts) {
		steps.push(STEP_REVIEW_CONFLICTS)
		warning = WARN_CONFLICTS
	}
	
	// Check if we have a PR diff only if it's a full request
	if (hasDiff && isFullRequest) {
		steps.push(STEP_REVIEW_CONFLICTS)
		warning = WARN_DIFF
	}

	if (hasEmptyCommits) {
		steps.push(STEP_REMOVE_EMPTY_COMMITS)
	}

	if (hasSkipCiCommits) {
		steps.push(STEP_AMEND_SKIP_CI)
	}

	let body = `Backport of #${prNumber}`

	if (warning !== '') {
		body += `\n\n Warning, ${warning}`
	}

	if (steps.length > 0) {
		body += `\n\n## Todo \n`
		body += [...new Set(steps)].map(step => `- [ ] ${step}`).join('\n')
	}

	body += LEARN_MORE

	return body
}

export const getFailureCommentBody = (task: Task, target: string, error: string = 'Unknown error') => {
	const { branch, commits } = task

	return `The backport to \`${branch}\` failed. Please do this backport manually.

\`\`\`bash
# Switch to the target branch and update it
git checkout ${branch}
git pull origin ${branch}

# Create the new backport branch
git checkout -b ${target}

# Cherry pick the change from the commit sha1 of the change against the default branch
# This might cause conflicts, resolve them
git cherry-pick ${commits.map(commit => commit.slice(0, 8)).join(' ')}

# Push the cherry pick commit to the remote repository and open a pull request
git push origin ${target}
\`\`\`

Error: ${error}

${LEARN_MORE}`
}
