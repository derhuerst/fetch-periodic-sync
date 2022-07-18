'use strict'

const test = require('tape')
const {createServer} = require('http')
const {promisify} = require('util')
const syncViaPeriodicFetch = require('.')

const serve = async (handleRequest) => {
	const server = createServer(handleRequest)

	const port = 60000 + Math.round(Math.random() * 500)

	const stop = promisify(server.close.bind(server))

	await new Promise((resolve, reject) => {
		server.listen(port, (err) => {
			if (err) reject(err)
			else resolve()
		})
	})

	return {
		url: 'http://localhost:' + port,
		stop,
	}
}

test('stop()-ing right away works', async (t) => {
	let setTimerCalls = 0
	const setTimer = (fn, ms) => {
		setTimerCalls++
		return setTimeout(fn, ms)
	}

	const {url, stop} = await serve((_, res) => {
		res.end(Buffer.from('abcd', 'hex'))
	})
	const sync = syncViaPeriodicFetch(url, {
		interval: 50,
		setTimer,
	})

	let stopEmitted = false
	sync.once('stop', () => {
		stopEmitted = true
	})

	await Promise.resolve()
	sync.stop()

	await new Promise((resolve, reject) => {
		sync.once('fetch-done', () => setTimeout(resolve, 100))
		sync.once('error', reject)
	})

	await stop()

	t.equal(setTimerCalls, 0, 'setTimer() has been called')
	t.ok(stopEmitted, '`stop` event not emitted')
})
