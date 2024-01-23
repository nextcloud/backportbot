import { describe, expect, test } from 'vitest'
import { extractBranchFromPayload, extractCommitsFromPayload } from './payloadUtils'

describe('Extracts valid commits from payload', () => {
	const payloads = [
		'/backport to stable28',
		'/backport! to stable28',
		'/backport 123456789 123456789 to stable28',
		'/backport! 123456789 123456789 to stable28',
		'/backport 0182735b7bb0ee7904f0622943afe689cdaf50d5 to stable28',
		'/backport! 0182735b7bb0ee7904f0622943afe689cdaf50d5 to stable28',
	]

	const expectedCommits = [
		[],
		[],
		['123456789', '123456789'],
		['123456789', '123456789'],
		['0182735b7bb0ee7904f0622943afe689cdaf50d5'],
		['0182735b7bb0ee7904f0622943afe689cdaf50d5'],
	]

	payloads.forEach((payload, index) => {
		test(payload, () => {
			expect(extractCommitsFromPayload(payload)).toEqual(expectedCommits[index])
		})
	})
})

describe('Throws error for invalid commits in payload', () => {
	const payloads = [
		'/backport 123 to stable28',
		'/backport! 123 to stable28',
		'/backport 123456789 123 to stable28',
		'/backport! 123456789 123 to stable28',
		'/backport 0182735b7bb0ee7904f0622943afe689cdaf50d5123465456 to stable28',
		'/backport! 0182735b7bb0ee7904f0622943afe689cdaf50d5123465456 to stable28',
		'/wrongcommand 123456789 123456789 to stable28',
	]

	payloads.forEach(payload => {
		test(payload, () => {
			expect(() => extractCommitsFromPayload(payload))
				.toThrow(`Failed to extract commits from payload: \`${payload}\``)
		})
	})
})

describe('Extracts valid branch from payload', () => {
	const payloads = [
		'/backport 123456789 to stable28',
		'/backport 123456789 to fix/123456/fix-something',
		'/backport 123456789 to fix-123456-fix-something',
	]

	const expectedBranches = [
		'stable28',
		'fix/123456/fix-something',
		'fix-123456-fix-something',
	]

	payloads.forEach((payload, index) => {
		test(payload, () => {
			expect(extractBranchFromPayload(payload)).toEqual(expectedBranches[index])
		})
	})
})

describe('Throws error for invalid branch in payload', () => {
	const payloads = [
		'/backport 123456789 to 123 456',
		'/backport 123456789 to',
	]

	const expectedErrors = [
		'Branch name `123 456` is invalid',
		'Branch name `` is invalid',
	]

	payloads.forEach((payload, index) => {
		test(payload, () => {
			expect(() => extractBranchFromPayload(payload))
				.toThrow(expectedErrors[index])
		})
	})
})
