const fs = require('fs')
const path = require('path')

class Config {
    constructor(fname) {
        this.Debug      = true
        this.Port       = 14500
        this.Secret     = "secret"
        this.CID        = '6736a6f47af610283ac8c4e73ae1d0e6a3c6bdbe456d949bc555dfea7fb20262'
        this.ShaderFile = 'galleryManager.wasm'
        this.DBFolder   = 'data-db'
        this.RestartPending = true
        this.WalletAPI  = {
            Address: "127.0.0.1:14666",
            ReconnectInterval: 5000
        }
        this.versions = {
          'nft': 200,
          'artist': 200,
          'collection': 200
        }

        let raw = fs.readFileSync(fname)
        let parsed = JSON.parse(raw.toString())
        Object.assign(this, parsed)

        this.DBFile = path.resolve(this.DBFolder)
        // TODO: add periodical GC
    }
}

module.exports = new Config('config.json')
