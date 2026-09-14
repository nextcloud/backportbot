import { describe, expect, test } from 'vitest'
import { parseBackportRequest } from './payloadUtils'

describe('parseBackportRequest', () => {
	test('parses a full request to a single branch', () => {
		expect(
			parseBackportRequest('/backport to stable28'),
		).toEqual({
			commits: [],
			branches: ['stable28'],
			isForced: false,
			isFullRequest: true,
			isFriendly: false,
		})
	})

	test('parses a forced full request', () => {
		expect(
			parseBackportRequest('/backport! to stable28'),
		).toEqual({
			commits: [],
			branches: ['stable28'],
			isForced: true,
			isFullRequest: true,
			isFriendly: false,
		})
	})

	test('parses a full request with please', () => {
		expect(
			parseBackportRequest('/backport to stable28 please'),
		).toEqual({
			commits: [],
			branches: ['stable28'],
			isForced: false,
			isFullRequest: true,
			isFriendly: true,
		})
	})

	test('parses a partial request with multiple commits', () => {
		expect(
			parseBackportRequest(
				'/backport 123456789 123456789 to stable28',
			),
		).toEqual({
			commits: ['123456789', '123456789'],
			branches: ['stable28'],
			isForced: false,
			isFullRequest: false,
			isFriendly: false,
		})
	})

	test('parses a partial request with a full commit hash', () => {
		expect(
			parseBackportRequest(
				'/backport 0182735b7bb0ee7904f0622943afe689cdaf50d5 to stable28',
			),
		).toEqual({
			commits: [
				'0182735b7bb0ee7904f0622943afe689cdaf50d5',
			],
			branches: ['stable28'],
			isForced: false,
			isFullRequest: false,
			isFriendly: false,
		})
	})

	test('parses an ordinary branch name', () => {
		expect(
			parseBackportRequest(
				'/backport 123456789 to fix/123456/fix-something',
			),
		).toEqual({
			commits: ['123456789'],
			branches: ['fix/123456/fix-something'],
			isForced: false,
			isFullRequest: false,
			isFriendly: false,
		})
	})

	test('parses an ordinary branch name containing hyphens', () => {
		expect(
			parseBackportRequest(
				'/backport 123456789 to fix-123456-fix-something',
			),
		).toEqual({
			commits: ['123456789'],
			branches: ['fix-123456-fix-something'],
			isForced: false,
			isFullRequest: false,
			isFriendly: false,
		})
	})

	test('expands an inclusive stable branch range', () => {
		expect(
			parseBackportRequest('/backport to stable28..stable31'),
		).toEqual({
			commits: [],
			branches: [
				'stable28',
				'stable29',
				'stable30',
				'stable31',
			],
			isForced: false,
			isFullRequest: true,
			isFriendly: false,
		})
	})

	test('expands a forced partial range request', () => {
		expect(
			parseBackportRequest(
				'/backport! 123456789 to stable28..stable31 please',
			),
		).toEqual({
			commits: ['123456789'],
			branches: [
				'stable28',
				'stable29',
				'stable30',
				'stable31',
			],
			isForced: true,
			isFullRequest: false,
			isFriendly: true,
		})
	})

	test('accepts a single-branch range', () => {
		expect(
			parseBackportRequest('/backport to stable28..stable28'),
		).toEqual({
			commits: [],
			branches: ['stable28'],
			isForced: false,
			isFullRequest: true,
			isFriendly: false,
		})
	})

	test('rejects invalid commits', () => {
		expect(() =>
			parseBackportRequest('/backport 123 to stable28'),
		).toThrow('Invalid commit')
	})

	test('rejects commits that are too long', () => {
		expect(() =>
			parseBackportRequest(
				'/backport 0182735b7bb0ee7904f0622943afe689cdaf50d5123465456 to stable28',
			),
		).toThrow('Invalid commit')
	})

	test('rejects a malformed command', () => {
		expect(() =>
			parseBackportRequest(
				'/wrongcommand 123456789 123456789 to stable28',
			),
		).toThrow('Invalid backport command')
	})

	test('rejects an invalid branch', () => {
		expect(() =>
			parseBackportRequest('/backport 123456789 to 123 456'),
		).toThrow('Branch name')
	})

	test('rejects a missing branch', () => {
		expect(() =>
			parseBackportRequest('/backport 123456789 to'),
		).toThrow('Branch name is missing')
	})

	test('rejects a descending range', () => {
		expect(() =>
			parseBackportRequest('/backport to stable31..stable28'),
		).toThrow('Branch range must be ascending')
	})

	test('rejects a range with a non-stable endpoint', () => {
		expect(() =>
			parseBackportRequest('/backport to stable28..main'),
		).toThrow('Branch name')
	})

	test('rejects ranges larger than the maximum', () => {
		expect(() =>
			parseBackportRequest('/backport to stable28..stable39'),
		).toThrow('maximum is 10')
	})

	test('parses a forced full range request', () => {
		expect(
			parseBackportRequest('/backport! to stable28..stable31'),
		).toEqual({
			commits: [],
			branches: ['stable28', 'stable29', 'stable30', 'stable31'],
			isForced: true,
			isFullRequest: true,
			isFriendly: false,
		})
	})

	test('ignores text after the command line', () => {
		expect(
			parseBackportRequest('/backport to stable28\nAdditional context'),
		).toEqual({
			commits: [],
			branches: ['stable28'],
			isForced: false,
			isFullRequest: true,
			isFriendly: false,
		})
	})

	test('rejects leading zeroes in stable branch ranges', () => {
		expect(() =>
			parseBackportRequest('/backport to stable028..stable031'),
		).toThrow('leading zeroes')
	})

	test('rejects a command prefix lookalike', () => {
		expect(() =>
			parseBackportRequest('/backporting to stable28'),
		).toThrow('Invalid backport command')
	})

	test('rejects a forced command prefix lookalike', () => {
		expect(() =>
			parseBackportRequest('/backport!foo to stable28'),
		).toThrow('Invalid backport command')
	})

	test('rejects an empty command', () => {
		expect(() =>
			parseBackportRequest('/backport'),
		).toThrow('Missing branch target')
	})

	test('rejects a forced empty command', () => {
		expect(() =>
			parseBackportRequest('/backport!'),
		).toThrow('Missing branch target')
	})
})
