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
        this.__pin_object(val.id, val.subname, val.ipfs_hash)
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
    const perBatch = 10
    let hprocessed = await store.getProcessedBlock(this.objname)
    let hnext = hprocessed + 1
    console.log(`__loadInternal for ${this.objname}s with depth ${depth}, hnext ${hnext}`)

    let tlabel = `__loadInternal-${this.objname}-${hnext}`
    console.time(tlabel)

    let {res} = await this.api.contractAsync({
      role: 'manager',
      action: `view_${this.objname}s`,
      h0: hnext,
      count: perBatch,
      cid: config.CID
    })

    utils.ensureField(res, 'items', 'array')
    console.log(`__loadInternal for ${this.objname}s completed: ${res.items.length} items`)
    console.timeEnd(tlabel)

    for(let item of res.items) {
      try {
        if (!item.data) {
          throw new Error('empty data on item')
        }

        let data = JSON.parse(item.data)
        if (data.version !== this.version) {
          throw new Error(`incorrect object version ${data.version}`)
        }

        console.log(`New ${this.objname} found: ${item.label}, ${item.id}`)
        await this.__process_item(item, data)
        await store.registerCompletedObject(this.objname, item.id)
      }
      catch(err) {
        console.log(`Failed to load ${this.objname}/${item.id}: ${err.stack}`)
        await store.registerFailedObject(this.objname, item.id, err)
      }
      hprocessed = Math.max(hprocessed, item.updated)
      await store.setObject(this.objname, item)
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

  queryId2Id(id) {
    return id
  }

  regRoutes(router) {
    let name = `/view_${this.objname}s`
    router.register(name, async (req, res, url) => {
      let id0 = url.query['id0']
      let h0 = url.query['h0']
      let count = parseInt(url.query['count'] || '20')
      if (count > 20) {
        res.writeHead(200)
        res.end(`count cannot be > 50, ${count} provided`)
        return
      }

      if (id0 && count) {
        id0 = this.queryId2Id(id0)
        let objects = await store.getObjectsById0(this.objname, id0, count + 1)
        let nextid = this.getZeroId()

        if (objects.length > count) {
          let last = objects.pop()
          nextid = last.id
        }

        let result = {'items': objects, nextid}
        res.writeHead(200)
        res.end(JSON.stringify(objects))
        return
      }

      if (h0 && count) {
        h0 = this.queryId2Id(h0)
        let objects = await store.getObjectsByH0(this.objname, h0, count)
        let result = {'items': objects}
        res.writeHead(200)
        res.end(JSON.stringify(objects))
        return
      }

      res.writeHead(200)
      res.end('NOT IMPLEMENTED')
    })
  }
}

module.exports = ObjectHandler