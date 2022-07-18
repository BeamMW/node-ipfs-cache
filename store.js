const level  = require('level')
const config = require('./config')
const status = require('./status')
const lexint = require('lexicographic-integer')

const FAILED_HASH_PREFIX = "failed-hash-"
const PENDING_HASH_PREFIX = "pending-hash-"
const FAILED_OBJ_PREFIX = "failed-obj-"
const COMPLETED_OBJS_PREFIX = "completed-objs-"
const PROCESSED_BLOCK_PREFIX = "processed-block-"
const COMPLETED_HASHES = "completed-hashes"
const FAILED_HASHES = "failed-hashes"
const PENDING_HASHES = "pending-hashes"

class Store {
    async init() {
      console.log("Database", config.DBFolder)
      this.db = level(config.DBFolder, {valueEncoding: 'json'})

      if (!this.db.supports.permanence) {
        throw new Error('Persistent storage is required')
      }

      await this.__ensure(COMPLETED_HASHES,  0)
      await this.__ensure(FAILED_HASHES,  0)
      await this.__ensure(PENDING_HASHES,  0)
      await this.__ensure_prefix(PROCESSED_BLOCK_PREFIX, 'artists', 0)
      await this.__ensure_prefix(PROCESSED_BLOCK_PREFIX, 'collections', 0)
      await this.__ensure_prefix(PROCESSED_BLOCK_PREFIX, 'nfts', 0)
      await this.__ensure_prefix(COMPLETED_OBJS_PREFIX, 'artists', 0)
      await this.__ensure_prefix(COMPLETED_OBJS_PREFIX, 'collections', 0)
      await this.__ensure_prefix(COMPLETED_OBJS_PREFIX, 'nfts', 0)
    }

    async __ensure(key, defval) {
      try {
        let val = await this.db.get(key)
        console.log(`\t${key} is ${val}`)
        status[key] = val
        return val
      }
      catch(err) {
        if (!err.notFound) {
          throw err
        }
      }

      await this.db.put(key, defval)
      console.log(`\t${key} initialized to ${defval}`)
      status[key] = defval
      return defval
    }

    async __ensure_prefix(prefix, name, defval) {
      let key = [prefix, name].join('')
      return await this.__ensure(key, defval)
    }

    async registerFailedObject(objname, id, reason) {
      let key = [FAILED_OBJ_PREFIX, objname, id].join('')
      await this.db.put(key, {objname, id, reason: reason.toString()})
    }

    async registerCompletedObject(objname, id) {
      let failedkey = [FAILED_OBJ_PREFIX, objname, id].join('')
      await this.db.del(failedkey)

      let completedkey = [COMPLETED_OBJS_PREFIX, objname, 's'].join('')
      let value = await this.db.get(completedkey)
      await this.db.put(completedkey, value + 1)
      status[completedkey]++
    }

    getFailedObjects(objname) {
      return this.db.iterator({
        gte: `${FAILED_OBJ_PREFIX}${objname}`,
        lte: `${FAILED_OBJ_PREFIX}${objname}~`
      })
    }

    //
    // Hashes
    //
    async registerPendingHash (objname, id, subname, ipfs_hash) {
      let key = [PENDING_HASH_PREFIX, objname, id, subname].join('')
      await this.db.put(key, {objname, subname, id, ipfs_hash})
      status[PENDING_HASHES]++
    }

    async registerFailedHash (objname, id, subname, ipfs_hash, reason) {
      let key = [FAILED_HASH_PREFIX, objname, id, subname].join('')
      await this.db.put(key, {objname, subname, id, ipfs_hash, reason: reason.toString()})
      status[FAILED_HASHES]++
    }

    async registerCompletedHash(objname, id, subname, ipfs_hash) {
      let failedkey = [FAILED_HASH_PREFIX, objname, id, subname].join('')
      this.db.get(failedkey, (err) => {
        if (!err) {
          status[FAILED_HASHES]--
          this.db.del(failedkey)
        }
      })

      let pendingkey = [PENDING_HASH_PREFIX, objname, id, subname].join('')
      this.db.get(pendingkey, (err) => {
        if (!err) {
          status[PENDING_HASHES]--
          this.db.del(pendingkey)
        }
      })

      let completed = status[COMPLETED_HASHES] + 1
      status[COMPLETED_HASHES] = completed
      await this.db.put(COMPLETED_HASHES, completed)
    }

    getPendingHashes (objname) {
      return this.db.iterator({
        gte: `${PENDING_HASH_PREFIX}${objname}`,
        lte: `${PENDING_HASH_PREFIX}${objname}~`
      })
    }

    getFailedHashes (objname) {
      return this.db.iterator({
        gte: `${FAILED_HASH_PREFIX}${objname}`,
        lte: `${FAILED_HASH_PREFIX}${objname}~`
      })
    }

    async getProcessedBlock(objname) {
      let key = [PROCESSED_BLOCK_PREFIX, `${objname}s`].join('')
      return await this.db.get(key)
    }

    async setProcessedBlock(objname, value) {
      let key = [PROCESSED_BLOCK_PREFIX, `${objname}s`].join('')
      await this.db.put(key, value)
      status[key] = value
    }

  //
  // Refactored
  //
  id2dbid(id) {
    console.log(`id2dbid ${id}, ${typeof(id)}`)
    if (typeof(id) === 'number') {
      return lexint.pack(id, 'hex')
    }
    return id
  }

  getIdKey(type, id) {
    if (id !== undefined) {
      id = this.id2dbid(id)
      return ['object', type, 'id', id].join('-')
    }
    return ['object', type, 'id'].join('-') + '-~'
  }

  getHKey(type, h0, id) {
    if (h0 !== undefined && id !== undefined) {
      h0 = this.id2dbid(h0)
      id = this.id2dbid(id)
      return ['object', type, 'height', h0, id].join('-')
    }

    if (h0 !== undefined) {
      h0 = this.id2dbid(h0)
      return ['object', type, 'height', h0].join('-') + '-!'
    }

    return ['object', type, 'height'].join('-') + '-~'
  }

  async getObjectById(type, id) {
    let ikey = this.getIdKey(type, id)

    try {
      return await this.db.get(ikey)
    }
    catch(err) {
      if (err.name !== 'NotFoundError') {
        throw err
      }
      return undefined
    }
  }

  async setObject(type, object) {
    let old = await this.getObjectById(type, object.id)
    if (old && old.updated > object.updated) {
        console.log(`!!! Updated skipped ${type}, id ${object.id}, hold ${old.updated}, hnew ${object.updated}`)
        return
    }

    let batch = []
    if (old) {
      let ohkey = this.getHKey(type, old.updated, old.id)
      console.log(`DEL ${old.id}`)
      batch.push({
        type: 'del',
        key: ohkey,
      })
    }

    let ikey = this.getIdKey(type, object.id)
    console.log(`PUT ${object.id}, ikey ${ikey}`)
    batch.push({
      type: 'put',
      key: ikey,
      value: object
    })

    let hkey = this.getHKey(type, object.updated, object.id)
    console.log(`PUT ${object.id}, hkey ${hkey}`)
    batch.push({
      type: 'put',
      key: hkey,
      value: object
    })

    await this.db.batch(batch)
  }

  async getObjectsById0(type, id0, count) {
    let ikey = this.getIdKey(type, id0)
    let ekey = this.getIdKey(type)
    let iter = this.db.iterator({
      gte: ikey,
      lte: ekey,
      limit: count
    })

    let res = []
    for await (const [key, val] of iter) {
      res.push(val)
    }

    return res
  }

  async getObjectsByH0(type, h0, count) {
    let skey = this.getHKey(type, h0)
    let ekey = this.getHKey(type)
    let iter = this.db.iterator({
      gte: skey,
      lte: ekey,
      limit: count
    })

    let res = []
    let processed = 0
    let hprocessed = 0
    console.log(`GET H0 ${h0} - ${skey}`)
    for await (const [key, val] of iter) {
      console.log(`--- ${key} - ${val.id} - ${val.label}`)
      if (processed++ < count) {
        res.push(val)
        hprocessed = val.updated
      }
      else {
        if (val.updated > hprocessed) {
          break
        }
        res.push(val)
      }
    }

    return res
  }
}

module.exports = new Store()
