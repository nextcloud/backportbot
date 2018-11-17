const githubApp = require('github-app')

module.exports = async function(installationId) {
    // Obtain token to push to this repo
    const auth = githubApp({
        id: process.env.APP_ID,
        cert: process.env.PRIVATE_KEY
    })
    const token = await auth.createToken(installationId)
    return token.data.token
}