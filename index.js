'use strict'

const {EventEmitter} = require('events')
const {fetch: _fetch} = require('fetch-ponyfill')()

// todo: try to use `HEAD` if server doesn't support conditional requests
const syncViaPeriodicFetch = (url, opt = {}) => {
	const {
		interval,
		fetchOpts,
	} = {
		interval: 30 * 1000, // 30s
		fetchOpts: {},
		...opt,
	}

	const out = new EventEmitter()

	let eTag = null
	let lastModified = null
	const fetch = async () => {
		const cachingHeaders = {}
		if (eTag !== null) {
			cachingHeaders['if-none-match'] = eTag
		} else if (lastModified !== null) {
			cachingHeaders['if-modified-since'] = lastModified
		}

		const res = await _fetch(url, {
			...fetchOpts,
			headers: {
				...fetchOpts.headers,
				...cachingHeaders,
			},
		})
		if (!res.ok && res.status !== 304) {
			const err = new Error(res.statusText)
			err.response = res
			throw err
		}

		let changed = true
		if (res.status === 304) changed = false

		const eT = res.headers.get('etag')
		if (eT) {
			if (eT === eTag) changed = false
			eTag = eT
		}

		let lM = res.headers.get('last-modified') || null
		lM = lM && +new Date(lM)
		if (!Number.isInteger(lM)) lM = null
		if (lM !== null) {
			if (lM <= lastModified) changed = false
			lastModified = lM
		}

		return {
			changed,
			response: res,
		}
	}

	let pFetching = null
	const refetch = () => {
		if (pFetching !== null) return pFetching;

		pFetching = fetch()
		.then(({changed, response: res}) => {
			pFetching = null
			if (changed) out.emit('change', res)
			return res
		}, (err) => {
			pFetching = null
			out.emit('error', err)
			throw err
		})
		return pFetching
	}

	let active = false
	let timer = null
	const loop = () => {
		refetch()
		.catch(() => {})
		.then(() => {
			if (!active) return;
			timer = setTimeout(loop, interval)
		})
	}

	const start = () => {
		if (timer !== null) return;
		active = true
		loop()
	}
	const stop = () => {
		if (timer === null) return;
		clearTimeout(timer)
		timer = null
		active = false
	}

	setImmediate(start)

	out.start = start
	out.stop = stop
	out.refetch = refetch
	return out
}

module.exports = syncViaPeriodicFetch
