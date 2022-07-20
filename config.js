const fs = require('fs')
const path = require('path')

class Config {
  constructor(fname) {
    this.Debug       = true
    this.Port        = 14500
    this.Secret      = "secret"
    this.CID         = '4390f75c95f60e6c069fb25a4c210d9b3b8a79804b1e5ddba431965ea8eb4cd9'
    this.ShaderFile  = 'galleryManager.wasm'
    this.DBFolder    = `data-db-${this.CID}`
    this.RestartPending = true
    this.Cache       = true
    this.Serve       = true
    this.AllowOrigin = '*'

    this.WalletAPI  = {
      Address: "127.0.0.1:10000",
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
