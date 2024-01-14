import { createWriteStream } from 'fs'
import { join } from 'node:path'

import { LOG_FILE, LogLevel, ROOT_DIR, Task } from './constants'

// Open the log file for appending
const logFile = createWriteStream(join(ROOT_DIR, LOG_FILE), { flags : 'a' })

// Log a message to the log file
const log = (task: Task, message: string, level: LogLevel): void => {
	logFile.write(JSON.stringify({
		level,
		task,
		message,
		time: new Date().toISOString(),
	}) + '\n')
}

export const error = (task: Task, message: string): void => {
	log(task, message, 'error')
}

export const warn = (task: Task, message: string): void => {
	log(task, message, 'warn')
}

export const info = (task: Task, message: string): void => {
	log(task, message, 'info')
}

export const debug = (task: Task, message: string): void => {
	log(task, message, 'debug')
}
