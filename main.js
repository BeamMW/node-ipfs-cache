const http   = require('http')
const Router = require('./router')
const config = require('./config')
const WalletAPI = require('./wallet-api')
const NFTSHandler = require('./nfts-handler')
const ArtistsHandler = require('./artists-handler')
const CollectionsHandler = require('./collections-handler')

async function main () {
  console.log("Starting IPFS cache service...")
  console.log("Mode is", config.Debug ? "Debug" : "Release")

  // Catch global promise error
  process.on('unhandledRejection', error => {
    console.log('Promise rejected', error);
    process.exit(1)
  })

  // initialize, order is important
  const store = require('./store')
  await store.init()
  const status  = require('./status')
  await status.init(store)

  // connection to wallet API
  const walletAPI = new WalletAPI(config.WalletAPI.Address, config.WalletAPI.ReconnectInterval)
  const artistsHandler = new ArtistsHandler(walletAPI)
  const nftsHandler = new NFTSHandler(walletAPI)
  const collsHandler = new CollectionsHandler(walletAPI)
  walletAPI.connect()

  // setup routes
  const router = new Router()

  if (config.Serve) {
    artistsHandler.regRoutes(router)
    nftsHandler.regRoutes(router)
    collsHandler.regRoutes(router)
  }

  router.register("/status", (...args) => status.report(...args))
  router.register("/", (req, res) => {
    res.writeHead(200)
    res.end('Hi! This is the IPFS cache service.')
  })

  // Start everything
  console.log("Cache service is launched. Listening on port", config.Port)
  const server = http.createServer((...args) => router.route(...args))
  server.listen(config.Port)
}

main().catch(err => {
  console.error("IPFS cache service critical failure. The following error has been reported:")
  console.error(err)
  process.exit(1)
})


