const githubApp = require('github-app')

module.exports = async function(installationId) {
    if (process.env.PRIVATE_KEY_PATH) {
        privateKey = require('fs').readFileSync(process.env.PRIVATE_KEY_PATH)
    } else {
        privateKey = process.env.PRIVATE_KEY
    }

    // Obtain token to push to this repo
    const auth = githubApp({
        id: process.env.APP_ID,
        cert: privateKey
    })
    const token = await auth.createToken(installationId)
    return token.data.token
}