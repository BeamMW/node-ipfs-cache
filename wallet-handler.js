const WalletApi = require('./wallet-api')
const config    = require("./config")
const status    = require("./status")
const fs        = require("fs");
const utils     = require("./utils")
const store     = require("./store")

// TODO: restrict file size
// TODO: check if we really need to fail in all cases
function fatal (err) {
    console.error(`Fatal Wallet API error:\n\t${JSON.stringify(err)}`)
    process.exit(1)
}

class WalletHandler {
    constructor() {
        this.shader = [...fs.readFileSync(config.ShaderFile)]
        this.restartPending = config.RestartPending
    }

    async connect() {
        this.api = new WalletApi(config.WalletAPI.Address, config.WalletAPI.ReconnectInterval)
        this.api.on('connect', () => this.__on_connect())
        this.api.on('result', (...args) => this.__on_api_result(...args))
        await this.api.connect()
    }

    __on_api_result(err, res, full) {
        if (err) {
            return fatal(err)
        }

        if (full.id === "ev_system_state") {
            return this.__on_system_state(res)
        }

        fatal(`Unexpected Wallet API result call ${full}`)
    }

    __on_connect () {
        this.api.contract (
            "role=manager,action=view",
            (...args) => this.__on_check_cid(...args),
            this.shader
        )
    }

    __on_check_cid (err, res) {
        if (err) {
            return fatal(err)
        }

        if (!res.contracts.some(el => el.cid === config.CID)) {
            return fatal(`CID not found '${config.CID}'`)
        }

        // We're ok to start watching
        this.api.call("ev_subunsub", {ev_system_state: true}, (err, res) => {
            if (err) {
                return fatal(err)
            }

            if (!res) {
                fatal("failed to subscibe to status update event")
            }
        })
    }

    async __on_system_state(state) {
        status.SystemState = state

        if (!state.is_in_sync || state.tip_height !== state.current_height) {
            // we're not in sync, wait
            return
        }

        if (this.restartPending) {
            console.log('Restarting pending artworks')
            this.restartPending = false

            for await (const [key, val] of store.getPendingArtworks()) {
                if (val.ipfs_hash) {
                    console.log(`Pending artwork ${val.id}/${val.ipfs_hash}`)
                    this.__pin_artwork(val.id, val.ipfs_hash)
                }
                else {
                    console.log(`Pending artwork ${val.id}`)
                    this.__download_artwork(val.id)
                }
            }
        }

        console.log("New tip:", state.tip_height)
        this.api.contract(
            `role=user,action=view_all,cid=${config.CID}`,
            (...args) => this.__on_load_artworks(...args)
        )
    }

    async __on_load_artworks (err, res) {
        if (err) {
            // This is not fatal, let it give a chance
            // to try again on the next tip
            console.error(err, "Failed to load artwork list")
            return
        }

        let lastRequestedId  = await store.getLastRequestedID()
        let lastRequestedIdx = undefined

        for (let idx = res.items.length - 1; idx >=0; idx--) {
            let item = res.items[idx]
            if (item.id <= lastRequestedId) {
                lastRequestedIdx = idx
                break
            }
        }

        if (lastRequestedIdx === res.items.length - 1) {
            if (config.Debug) {
                console.log("Unprocessed artworks: 0")
            }
            return
        }

        let from = lastRequestedIdx + 1 || 0
        let to   = res.items.length - 1
        console.log(`Unprocessed artworks: ${to - from + 1}, [${from}..${to}]`)

        for (let idx = from; idx <= to; ++idx) {
            let id = res.items[idx].id
            this.__download_artwork(id)
        }

        store.setLastRequestedID(res.items[to].id)
    }

    __download_artwork(id) {
        store.registerPendingArtwork(id)
        this.api.contract(
            `role=user,action=download,cid=${config.CID},id=${id}`,
            (err, res) => this.__on_download_artwork(err, res, id)
        )
    }

    async __on_download_artwork (err, res, id) {
        if (err) {
            console.log(`Failed to download artwork ${id}, ${JSON.stringify(err)}`)
            store.registerFailedArtwork(id)
            return
        }

        try
        {
            let data = utils.hexDecodeU8A(res.data)
            let ver = data[0]

            if (ver !== 2) {
                if (config.Debug) {
                    console.log(`Artwork ${id} version is ${ver}, skipped`)
                }
                store.removePendingArtwork(id)
                return
            }

            let rawMeta = data.subarray(1)
            let meta = JSON.parse((new TextDecoder()).decode(rawMeta))

            if (!meta.ipfs_hash) {
                throw `Artwork version is ${ver} but ipfs_hash is not found`
            }

            if (config.Debug) {
                console.log(`Artwork ${id} ipfs_hash is ${meta.ipfs_hash}`)
            }

            this.__pin_artwork(id, meta.ipfs_hash)
        }
        catch(err) {
            console.error(`\tFailed to process artwork id ${id}, ${utils.err2str(err)}`)
            store.registerFailedArtwork(id)
        }
    }

    __pin_artwork(id, ipfs_hash) {
        store.registerPendingArtwork(id, ipfs_hash)
        this.api.call("ipfs_pin", {hash: ipfs_hash}, (err, res) => {
            if (err)  {
                console.log(`Failed to pin artwork ${id}/${ipfs_hash}, ${JSON.stringify(err)}`)
                return
            }

            store.removePendingArtwork(id)
            if (config.Debug) {
                console.log(`Artwork ${id}/${ipfs_hash} successfully pinned`)
            }
        })
    }
}

module.exports = new WalletHandler()
