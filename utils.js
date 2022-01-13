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

module.exports = {
    err2str, hexDecodeU8A
}