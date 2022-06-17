const config = require('./config')
const utils = require('./utils')
const store = require('./store')

class ObjectHandler {
  constructor({objname, api}) {
    console.log(`Initializing ${objname}s handler`)
    this.objname = objname
    this.api = api
    this.api.on('block', (...args) => this.__on_block(...args))
    this.version = config.versions[this.objname]
    this.restartPending = config.RestartPending
    this.loading = false
  }

  async __on_block(state) {
    if (config.Debug) {
      console.log(`${this.objname}s handler new block ${state.current_height}`)
    }

    if (this.restartPending) {
      console.log(`Restarting pending ${this.objname}s if any`)
      this.restartPending = false

      for await (const [key, val] of store.getPendingHashes(this.objname)) {
        console.log(`Pending ${this.objname}/${val.id}/${val.subname}/${val.ipfs_hash}`)
        await this.__pin_object(val.id, val.subname, val.ipfs_hash)
      }

      // do not reload failed hashes, they are already in pending
    }

    if (this.loading) {
      return
    }

    this.loading = true
    await this.__loadInternal(0)
  }

  async __loadInternal(depth) {
    const perBatch = 1 //config.Debug ? 1 : 50
    let hprocessed = await store.getProcessedBlock(this.objname)
    let hnext = hprocessed + 1
    console.log(`_loadAsyncInternal for ${this.objname}s with depth ${depth}, hnext ${hnext}`)

    let {res} = await this.api.contractAsync({
      role: 'manager',
      action: `view_${this.objname}s`,
      h0: hnext,
      count: perBatch,
      cid: config.CID
    })

    utils.ensureField(res, 'items', 'array')
    for(let item of res.items) {
      try {
        if (!item.data) {
          throw new Error('empty data on item')
        }

        let data = JSON.parse(item.data)
        if (data.version !== this.version) {
          throw new Error(`incorrect object version ${data.version}`)
        }

        await this.__process_item(item, data)
        await store.registerCompletedObject(this.objname, item.id)
      }
      catch(err) {
        console.log(`Failed to load ${this.objname}/${item.id}: ${err.stack}`)
        await store.registerFailedObject(this.objname, item.id, err)
      }

      hprocessed = Math.max(hprocessed, item.updated)
    }

    await store.setProcessedBlock(this.objname, hprocessed)

    if (res.items.length > 0) {
      process.nextTick(() => this.__loadInternal(++depth))
      return
    }

    console.log(`Finished processing ${this.objname}s, at ${hprocessed}`)
    this.loading = false
  }

  async __pin_object(id, subname, ipfs_hash) {
    let fullid = `${this.objname}/${id}/${subname}/${ipfs_hash}`
    if (config.Debug) {
      console.log(`Pinning ${fullid}`)
    }

    await store.registerPendingHash(this.objname, id, subname, ipfs_hash)
    this.api.call("ipfs_get", {hash: ipfs_hash}, (err) => {
      if (err)  {
        console.log(`Failed to pin ${fullid}, ${JSON.stringify(err)}`)
        store.registerFailedHash(this.objname, id, subname, ipfs_hash, err)
        return
      }
      console.log(`${fullid} successfully pinned`)
      store.registerCompletedHash(this.objname, id, subname)
    })
  }
}

module.exports = ObjectHandler