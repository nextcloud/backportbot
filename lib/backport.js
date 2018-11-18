const git = require('./git.js')

module.exports = async function(log, context, origPR, target, token, commits) {
    return git(log, context, token, commits, target)
}