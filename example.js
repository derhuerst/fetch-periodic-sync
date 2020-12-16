'use strict'

const syncViaPeriodicFetch = require('.')

const url = 'https://wikipedia.org/'

const synced = syncViaPeriodicFetch(url, {
	interval: 5_000,
})

synced.on('error', console.error)
synced.on('change', () => console.log('resource changed!'))
