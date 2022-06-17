function err2str (err) {
    if (typeof err === 'string') {
        return err
    }

    let jstr = JSON.stringify(err)
    return jstr === "{}" ? err.toString() : jstr
}

function hexDecodeU8A (hex) {
    return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

function fatal (err) {
  console.error(`Fatal error:\n\t${JSON.stringify(err)}`)
  process.exit(1)
}

function ensureField(obj, name, type) {
  if (obj[name] == undefined) {
    throw new Error(`No '${name}' field on object`)
  }

  if (type == 'array') {
    if (!Array.isArray(obj[name])) {
      throw new Error(`${name} is expected to be an array`)
    }
    return
  }

  if (type) {
    let tof = typeof obj[name]
    if (tof !== type) {
      throw new Error(`Bad type '${tof}' for '${name}'. '${type}' expected.`)
    }
    return
  }
}

module.exports = {
    err2str, hexDecodeU8A, fatal, ensureField
}