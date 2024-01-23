import { defineConfig } from 'vitest/config'

const exclude = ['cache/**', 'dist/**', 'node_modules/**', 'work/**']

export default defineConfig({
	test: {
		globals: true,
		exclude,
		coverage: {
			include: ['src/**'],
			exclude,
			provider: 'istanbul',
			reporter: ['lcov', 'text'],
		},
	},
})
