const config = require('./config')

class Status {
  constructor() {
    this.Config = config
  }

  async init(store) {
    this.store = store
  }

  //
  // Objects
  //
  async report (req, res, url) {
    const q = url.parse(req.url,true).query
    if (url.query['secret'] !== config.Secret) {
      res.writeHead(200, {'Content-Type': 'text/plain'})
      res.end("I'm still alive")
      return
    }

    let info = Object.assign({}, this)
    delete info.store

    info.FailedObjects = {}
    info.FailedHashes = {}

    let objnames = ['nft', 'collection', 'artist']
    for (let objname of objnames) {
      info.FailedObjects[`${objname}s`] = {}
      info.FailedHashes[`${objname}s`] = {}

      {
        let count = 0
        for await (const [key, val] of this.store.getFailedObjects(objname)) {
          info.FailedObjects[`${objname}s`][val.id] = val.reason
          count++
        }
        info.FailedObjects[`${objname}s-count`] = count
      }

      {
        let count = 0
        for await (const [key, val] of this.store.getFailedHashes(objname)) {
          info.FailedHashes[`${objname}s`][val.id] = {}
          info.FailedHashes[`${objname}s`][val.id][val.subname] = {ipfs_hash: val.ipfs_hash, reason: val.reason}
          count++
        }
        info.FailedHashes[`${objname}s-count`] = count
      }
    }

    res.writeHead(200, {'Content-Type': 'application/json'})
    return res.end(JSON.stringify(info))
  }
}

module.exports = new Status()
