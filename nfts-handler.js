const ObjectHandler = require('./object-handler')
const config = require('./config')

class NFTSHandler extends ObjectHandler {
  constructor(api) {
    super({objname: 'nft', api})
  }

  async __process_item(item, data) {
    let image = data.image
    if (!image) throw new Error('empty image')
    if (!image.ipfs_hash) throw new Error('no ipfs hash on image')
    await this.__pin_object(item.id, 'image', image.ipfs_hash)
  }
}

module.exports = NFTSHandler