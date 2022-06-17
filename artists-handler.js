const ObjectHandler = require('./object-handler')

class ArtistsHandler extends ObjectHandler {
  constructor(api) {
    super({objname: 'artist', api})
  }

  async __process_item(item, data) {
    let avatar = data.avatar
    if (avatar) {
      if (!avatar.ipfs_hash) throw new Error('no ipfs hash on avatar')
      await this.__pin_object(item.id, 'avatar', avatar.ipfs_hash)
    }

    let banner = data.banner
    if (banner) {
      if (!banner.ipfs_hash) throw new Error('no ipfs hash on banner')
      await this.__pin_object(item.id, 'banner', banner.ipfs_hash)
    }
  }
}

module.exports = ArtistsHandler