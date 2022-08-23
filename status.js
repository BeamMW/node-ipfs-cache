const config = require('./config')

class Status {
  constructor() {
    this.Config = config
  }

  async init(store) {
    this.store = store
  }

  async report (req, res, url) {
    const q = url.parse(req.url,true).query
    if (url.query['secret'] !== config.Secret) {
      res.writeHead(200, {'Content-Type': 'text/plain'})
      res.end("I'm still alive")
      return
    }

    //
    // Stats = values stored on this object + some info from store
    //

    // This object data
    let info = Object.assign({}, this)
    delete info.store

    // Info from store
    await this.store.fillStats(info)

    res.writeHead(200, {'Content-Type': 'application/json'})
    return res.end(JSON.stringify(info))
  }
}

module.exports = new Status()
