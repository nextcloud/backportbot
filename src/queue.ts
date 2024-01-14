import PQueue from 'p-queue'
import { Task } from './constants'
import { backport } from './backport'

let queue: PQueue

export const addToQueue = (task: Task): Promise<void> => {
	if (!queue) {
		queue = new PQueue({ concurrency: 1 })
	}

	return new Promise((resolve, reject) => {
		queue.add(async () => {
			await backport(task).then(resolve).catch(reject)
		})
	})
}
