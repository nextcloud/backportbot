import PQueue from 'p-queue'
import { Task } from './constants.js'
import { backport } from './backport.js'
import { error } from './logUtils.js'

let queue: PQueue

export async function addToQueue(task: Task): Promise<void> {
	if (!queue) {
		queue = new PQueue({ concurrency: 1 })
	}

	try {
		await queue.add(async () => {
			await backport(task)
		})
	} catch(e) {
		error(task, e)
		throw e
	}
}
