const net = require('net')
const status = require('./status')
const config = require('./config')
const EventEmitter = require('events')
const fs = require('fs')
const utils = require('./utils')

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
      this.shader = [...fs.readFileSync(config.ShaderFile)]
      this.first_connect = true

      status.WalletAPI = {
        timeouts: 0,
        reconnects: 0,
        errors: 0,
        connected: false,
        lastError: undefined,
        address: this.address,
      }

      this.client.on("connect", (...args) => this.__on_socket_connected(...args))
      this.client.on("close",   (...args) => this.__on_socket_closed(...args))
      this.client.on("timeout", (...args) => this.__on_socket_timeout(...args))
      this.client.on("data",    (...args) => this.__on_socket_data(args))
      this.client.on("error",   (...args) => this.__on_socket_error(...args))
    }

    connect () {
      console.log("Connecting to the Wallet API at", this.address)
      this.buffer = ""
      this.calls  = {} // TODO: call all callbacks with error
      this.client.connect(this.port, this.host)
    }

    async __on_socket_connected () {
      //
      // Check CID
      //
      let {res} = await this.contractAsync({role: 'manager', 'action': 'view'}, this.shader)
      if (!res.contracts.some(el => el.cid === config.CID)) {
        // we always fail on wrong CID
        throw new Error(`CID not found '${config.CID}'`)
      }
      console.log('CID OK,', config.CID)

      //
      // Subscribe to the new block event
      //
      await this.callAsync("ev_subunsub", {ev_system_state: true})

      //
      // Report connected
      //
      console.log("Successfully connected to the Wallet API. Processing would be started on the new block")
      this.first_connect = false
      status.WalletAPI.connected = true
      this.emit('connect')
    }

    __on_socket_closed () {
      console.log("Wallet API connection closed. Will try to reconnect in", this.reconnectInterval)
      status.WalletAPI.connected = false

      setTimeout(() => {
        status.WalletAPI.reconnects++
        this.connect()
      }, this.reconnectInterval)
    }

    __on_socket_timeout () {
      console.log("Wallet API connection timeout")
      status.WalletAPI.timeouts++
      this.client.close()
    }

    __on_socket_error (err) {
      if (this.first_connect) {
        // Fail if error is reported for initial connection attempt, subsequent fails cause reconnects
        this.first_connect = false
        throw new Error(`Failed to connect to the wallet API ${err}`)
      }

      console.error("Wallet API connection error\n", err)
      status.WalletAPI.errors++
      status.WalletAPI.lastError = err
    }

    __on_socket_data (data) {
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
        this.__on_api_response(response)
      }
    }

    __on_api_response (response) {
      let answer = JSON.parse(response)

      let nocback = (err, res, full) => {
        if (err) {
          throw new Error(`__on_api_response error ${err}`)
        }

        if (full.id === "ev_system_state") {
          status.SystemState = res
          if (!res.is_in_sync || res.tip_height !== res.current_height) {
            // we're not in sync, wait
            console.log(`ev_system_state is not in sync: ${res.is_in_sync}, ${res.tip_height}, ${res.current_height}`)
            return
          }
          console.log(`New block ${res.tip_height}`)
          this.emit('block', res)
          return
        }

        throw new Error(`Unexpected Wallet API result ${JSON.stringify(full)}`)
      }

      const id = answer.id
      const call  = this.calls[id] || {}
      const cback = call.cback || nocback
      delete this.calls[id]

      let makeError = (message) => {
        return new Error(`${message} for for method '${call.method}' and args ${JSON.stringify(call.params)}`)
      }

      if (answer.error) {
        let err = makeError(JSON.stringify(answer))
        return cback(err)
      }

      if (typeof answer.result == 'undefined') {
        let err = makeError(`invalid api call result ${answer}`)
        return cback(err)
      }

      // handle shader results
      if (typeof answer.result.output == 'string') {
        let shaderAnswer = JSON.parse(answer.result.output)
        if (shaderAnswer.error) {
          return cback({
            error: shaderAnswer.error,
            answer,
            jserror: makeError('shader error')
          })
        }
        return cback(null, shaderAnswer, answer)
      }
      return cback(null, answer.result, answer)
    }

    call (method, params, cback) {
      let callid = ['call', this.callID++].join('-')
      this.calls[callid] = {cback, method, params}

      let request = {
        jsonrpc: '2.0',
        id: callid,
        method,
        params,
      }

      let tosend = [JSON.stringify(request), '\n'].join('')
      //if (request.params.contract) {
        // this is to minimize trash in logs
      //  request.params.contract = "..."
      //}

      this.client.write(tosend)
    }

    async callAsync(method, params) {
      return new Promise((resolve, reject) => {
        this.call(method, params, (err, res, full) => {
          if (err) return reject(err)
          return resolve({res, full})
        })
      })
    }

    contract (args, cback, bytes) {
      let params = {
        "create_tx": false
      }

      if (args) {
        let sargs = ''
        for (let key in args) {
          if (sargs) sargs += ','
          sargs += `${key}=${args[key]}`
        }
        params = Object.assign({
          "args": sargs
        }, params)
      }

      if (bytes) {
        params = Object.assign({
          "contract": bytes
        }, params)
      }

      return this.call('invoke_contract', params, cback)
    }

    async contractAsync(args, bytes) {
      return new Promise((resolve, reject) => {
        this.contract(args, (err, res, full) => {
          if (err) return reject(err)
          return resolve({res, full})
        },
        bytes)
      })
    }
}

module.exports = WalletApi
