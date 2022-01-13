const parser = require('url')

class Router {
    constructor() {
        this.handlers = {}
        this.__missing = function(req, res) {
            res.writeHead(404)
            res.end("No route registered for " + req.url.pathname)
        }
    }

    register (url, method) {
        this.handlers[url] = method
    }

    route (req, res) {
        let url = parser.parse(req.url, true)
        let handler = this.handlers[url.pathname]
        return (handler ? handler : this.__missing)(req, res, url)
    }
}

module.exports = Router
