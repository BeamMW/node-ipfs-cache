const ObjectHandler = require('./object-handler')
const config = require('./config')

class CollectionsHandler extends ObjectHandler {
  constructor(api) {
    super({objname: 'collection', api})
  }

  async __process_item(item, data) {
    let cover = data.cover
    if (cover) {
      if (!cover.ipfs_hash) throw new Error('no ipfs hash on cover')
      if (config.Cache) this.__pin_object(item.id, 'cover', cover.ipfs_hash)
    }
  }

  queryId2Id(id) {
    return parseInt(id)
  }
}

module.exports = CollectionsHandler