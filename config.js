const fs = require('fs')
const path = require('path')

class Config {
    constructor(fname) {
        this.Debug      = true
        this.Port       = 14500
        this.Secret     = "secret"
        this.CID        = '74f3435d5e659bbf4510433d4997d9c05b73b69b305d29a3b0c43babb795ee05'
        this.ShaderFile = 'galleryManager.wasm'
        this.DBFolder   = `data-db-${this.CID}`
        this.RestartPending = true
        this.Cache      = true
        this.Serve      = true
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
