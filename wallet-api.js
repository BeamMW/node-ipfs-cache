const net = require('net')
const status = require('./status')
const config = require('./config')
const EventEmitter = require('events')

class WalletApi extends EventEmitter {
    constructor(address, interval) {
        super()

        let [host, port] = address.split(":")
        this.host    = host
        this.port    = port
        this.address = address
        this.client  = new net.Socket()
        this.buffer  = ""
        this.reconnectInterval = interval
        this.callID  = 0
        this.calls   = {}

        status.WalletAPI = {
            timeouts: 0,
            reconnects: 0,
            errors: 0,
            connected: false,
            lastError: undefined,
            address: this.address,
        }

        this.client.on("connect", (...args) => this.__on_connected(...args))
        this.client.on("close",   (...args) => this.__on_closed(...args))
        this.client.on("timeout", (...args) => this.__on_timeout(...args))
        this.client.on("data",    (...args) => this.__on_data(args))
    }

    async connect () {
        return new Promise((resolve, reject) => {
            // Fail if error is reported for initial connection attempt
            this.client.once("error", reject)
            this.client.once("connect", (...args) => {
                this.client.on("error", (...args) =>  this.__on_error(...args))
                resolve()
            })
            this.__connect()
        })
    }

    __connect () {
        console.log("Connecting to the Wallet API at", this.address)
        this.buffer = ""
        this.calls  = {}
        this.client.connect(this.port, this.host)
    }

    __on_connected () {
        console.log("Successfully connected to the Wallet API")
        status.WalletAPI.connected = true
        this.emit('connect')
    }

    __on_closed () {
        console.log("Wallet API connection closed. Will try to reconnect in", this.reconnectInterval)
        status.WalletAPI.connected = false

        setTimeout(() => {
            status.WalletAPI.reconnects++
            this.__connect()
        }, this.reconnectInterval)
    }

    __on_timeout () {
        console.log("Wallet API connection timeout")
        status.WalletAPI.timeouts++
        this.client.close()
    }

    __on_error (err) {
        console.error("Wallet API connection error\n", err)
        status.WalletAPI.errors++
        status.WalletAPI.lastError = err
    }

    __on_data (data) {
        this.buffer += data.toString()

        while (true)
        {
            let br = this.buffer.indexOf('\n')
            if (br === -1) {
                return
            }

            let split = this.buffer.split('\n')
            let response = split[0]
            this.buffer = split.slice(1).join('\n')
            this.__on_response(response)
        }
    }

    __on_response (response) {
        try {
            let answer = JSON.parse(response)
            // console.log(`Wallet API response:\n\t${response}`)

            let nocback = (err, res, full) => {
                this.emit("result", err, res, full)
            }

            const id = answer.id
            const cback = this.calls[id] || nocback
            delete this.calls[id]

            if (answer.error) {
                return cback(answer)
            }

            if (typeof answer.result == 'undefined') {
                return cback({
                    error: "no valid api call result",
                    answer
                })
            }

            if (typeof answer.result.output == 'string') {
                // this is shader result
                let shaderAnswer = JSON.parse(answer.result.output)
                if (shaderAnswer.error) {
                    return cback({
                        error: shaderAnswer.error,
                        answer
                    })
                }
                return cback(null, shaderAnswer, answer)
            }

            return cback(null, answer.result, answer)
        }
        catch(err) {
            console.log(`Failed to parse Wallet API response\n\t${response}\n\t${err}`)
        }
    }

    call (method, params, cback) {
        let callid = ['call', this.callID++].join('-')
        this.calls[callid] = cback

        let request = {
            jsonrpc: '2.0',
            id:      callid,
            method,
            params,
        }

        let tosend = [JSON.stringify(request), '\n'].join('')
        if (config.Debug) {
            if (request.params.contract) {
                request.params.contract = "..."
            }
            // console.log("Wallet API request:\n\t", JSON.stringify(request))
        }

        this.client.write(tosend)
    }

    contract (args, cback, bytes) {
        let params = {
            "create_tx": false
        }

        if (args) {
            params = Object.assign({
                "args": args
            }, params)
        }

        if (bytes) {
            params = Object.assign({
                "contract": bytes
            }, params)
        }

        return this.call('invoke_contract', params, cback)
    }
}

module.exports = WalletApi

