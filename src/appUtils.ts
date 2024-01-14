import { App } from '@octokit/app'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

import { APP_ID, PRIVATE_KEY_FILENAME, ROOT_DIR, WEBHOOK_SECRET } from './constants'

const initApp = (): App => {
	const privateKey = readFileSync(join(ROOT_DIR, PRIVATE_KEY_FILENAME), 'utf-8').toString()
	return new App({
		appId: APP_ID,
		privateKey,
		webhooks: {
			secret: WEBHOOK_SECRET,
		},
	})
}

let app: App | null = null
export const getApp = (): App => {
	if (!app) {
		app = initApp()
	}
	return app
}
