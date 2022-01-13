const url    = require('url')
const config = require('./config')

class Status {
    constructor() {
        this.Config = config
    }

    report (req, res, url) {
        const q = url.parse(req.url,true).query
        if (url.query['secret'] !== config.Secret) {
            res.writeHead(200, {'Content-Type': 'text/plain'})
            res.end("I'm still alive")
            return
        }

        res.writeHead(200, {'Content-Type': 'application/json'})
        return res.end(JSON.stringify(this))
    }
}

module.exports = new Status()
