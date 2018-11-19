const git = require('./git.js')
const getCommits = require('./commits.js')
const getToken = require('./token.js')
const pullRequest = require('./pr.js')

module.exports = async function(context, id, targets) {
    //TODO: Handle errors

    const commits = await getCommits(context)
    const token = await getToken(context.payload.installation.id)
    const pr = await pullRequest.getPR(context, id)

    let success = true

    for (target of targets) {
        try {
            const branch = await git(context, token, commits, target)
            const newPR = await pullRequest.newReady(context, pr.data.number, pr.data.title, target, branch)
            await pullRequest.backportSuccess(context, target, newPR.data.number)
            const reviewers = await pullRequest.getReviewers(context)
            await pullRequest.requestReviewers(context, newPR.data.number, reviewers)
        } catch (e) {
            context.log.debug(e)
            context.log.warn('Backport to ' + target + ' failed')
            success = false
            pullRequest.backportFailed(context, target)
        }
    }

    return success
}