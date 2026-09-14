import { BackportRequest, Task } from './constants.js'

type TaskContext = Omit<
	Task,
	'branch' | 'commits' | 'isFullRequest'
>

export const createTasks = (
	context: TaskContext,
	request: BackportRequest,
): Task[] => {
	const branches = [...new Set(request.branches)]

	return branches.map(branch => ({
		...context,
		branch,
		commits: request.commits,
		isFullRequest: request.isFullRequest,
	}))
}
