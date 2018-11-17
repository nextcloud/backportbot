const git = require('./git.js')

module.exports = async function(log, context, origPR, target, token, commits) {
    const backportBranch = await git(log, context, token, commits, target)
}