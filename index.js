'use strict'

const {EventEmitter} = require('events')
const {fetch: _fetch} = require('fetch-ponyfill')()

// todo: try to use `HEAD` if server doesn't support conditional requests
const syncViaPeriodicFetch = (url, opt = {}) => {
	const {
		interval: maxInterval,
		respectDataSaving,
		respectPageVisibility,
		fetchOpts,
		setTimer,
		clearTimer,
	} = {
		interval: 30 * 1000, // 30s
		respectDataSaving: true,
		respectPageVisibility: true,
		fetchOpts: {},
		setTimer: setTimeout,
		clearTimer: clearTimeout,
		...opt,
	}
	const minInterval = 'minInterval' in opt
		? opt.minInterval
		: maxInterval * 3

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

		out.emit('fetch')
		pFetching = fetch()
		.then(({changed, response: res}) => {
			pFetching = null
			out.emit('fetch-done')
			if (changed) out.emit('change', res)
			return res
		}, (err) => {
			pFetching = null
			out.emit('fetch-done')
			out.emit('error', err)
			throw err
		})
		return pFetching
	}

	const doc = globalThis.document
	const isPageHidden = () => {
		if (!respectPageVisibility || !doc) return false
		return typeof doc.hidden === 'boolean' ? doc.hidden : false
	}
	const con = globalThis.navigator && globalThis.navigator.connection
	const shouldSaveData = () => {
		return respectDataSaving && con ? con.saveData : false
	}

	let active = false
	let timer = null
	const loop = () => {
		refetch()
		.catch(() => {})
		.then(() => {
			if (!active) return;

			// todo: take download time of the resource into account?
			// todo: take response latency into account?
			// todo: adapt timeout on data saving/page visibility *change*
			const interval = isPageHidden() || shouldSaveData()
				? minInterval
				: maxInterval
			timer = setTimer(loop, interval)
		})
	}

	const start = () => {
		if (active) return;
		active = true
		loop()
		out.emit('start')
	}
	const stop = () => {
		if (!active) return;
		if (timer === null) {
			clearTimer(timer)
			timer = null
		}
		active = false
		out.emit('stop')
	}

	start()

	out.url = () => url
	out.start = start
	out.stop = stop
	out.isActive = () => !!active
	out.refetch = refetch
	out.isFetching = () => !!pFetching
	return out
}

module.exports = syncViaPeriodicFetch
