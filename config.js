const fs = require('fs')
const path = require('path')

class Config {
    constructor(fname) {
        this.Debug      = true
        this.Port       =  14000
        this.Secret     = "secret"
        this.CID        =  'b51efe78d3e7c83c8dbc3d59d5e06b2bd770139e645bc19e50652632cbdd47d1'
        this.ShaderFile = 'galleryManager.wasm'
        this.DBFolder   = 'data.db'
        this.RestartPending = true
        this.WalletAPI  = {
            Address: "127.0.0.1:10000",
            ReconnectInterval: 5000
        }

        let raw = fs.readFileSync(fname)
        let parsed = JSON.parse(raw.toString())
        Object.assign(this, parsed)

        this.DBFile = path.resolve(this.DBFolder)
    }
}

module.exports = new Config('config.json')
