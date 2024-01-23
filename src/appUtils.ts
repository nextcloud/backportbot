import { App } from '@octokit/app'
import { readFileSync } from 'node:fs'

import { APP_ID, PRIVATE_KEY_PATH, WEBHOOK_SECRET } from './constants'

const initApp = (): App => {
	const privateKey = readFileSync(PRIVATE_KEY_PATH, 'utf-8').toString()
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
