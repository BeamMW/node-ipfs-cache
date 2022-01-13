const level  = require('level')
const config = require('./config')
const status = require('./status')

const LASTRQ_ID = "last-requested-id"
const FAILED_PREFIX = "failed-artwork-"
const PENDING_PREFIX = "pending-artwork-"

function fatal (err) {
    if (err) {
        console.error(err)
        process.exit(1)
    }
}

class Store {
    constructor() {
    }

    async init (fname) {
        console.log("Database", config.DBFolder)
        this.db = level(config.DBFolder, {valueEncoding: 'json'})

        if (!this.db.supports.permanence) {
            throw new Error('Persistent storage is required')
        }

        await this.__ensure(LASTRQ_ID, 0)
    }

    async __ensure(key, defval) {
        try {
            let val = await this.db.get(key)
            console.log(`\t${key} is ${defval}`)
            status[key] = val
            return val
        }
        catch(err) {
            if (!err.notFound) {
                throw err
            }
            this.__put_async(key, defval)
            console.log(`\t${key} initialized to ${defval}`)
            status[key] = defval
            return defval
        }
    }

    async __get(key) {
        return this.db.get(key)
    }

    __put_async (key, val) {
        this.db.put(key, val, err => fatal(err))
    }

    __del_async (key) {
        this.db.del(key, err => fatal(err))
    }

    async getLastRequestedID () {
        return this.__get(LASTRQ_ID)
    }

    setLastRequestedID (val) {
        status.lastRequestedId = val
        return this.__put_async(LASTRQ_ID, val)
    }

    registerFailedArtwork (id) {
        let key = [FAILED_PREFIX, id].join('')
        this.__put_async(key, id)
    }

    registerPendingArtwork (id, ipfs_hash) {
        let key = [PENDING_PREFIX, id].join('')
        this.__put_async(key, {id, ipfs_hash})
    }

    removePendingArtwork (id) {
        let key = [PENDING_PREFIX, id].join('')
        this.__del_async(key)
    }

    getPendingArtworks () {
        return this.db.iterator({
            gte: `${PENDING_PREFIX}`,
            lte: `${PENDING_PREFIX}~`
        })
    }
}

module.exports = new Store()
