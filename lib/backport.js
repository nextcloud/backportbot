const git = require('./git.js')
const getCommits = require('./commits.js')
const getToken = require('./token.js')
const pullRequest = require('./pr.js')

function getMilestoneIdForTarget(context, milestones, branch) {
    context.log.info('Find milestone for target "' + branch + '"')

    const shortenedTarget = branch.replace(/^\D+/, '')

    let milestoneId = 0
    let milestoneTitle = ''

    for (const milestone of milestones.data) {
        let title = milestone.title
        // remove any character until the very first one
        title = title.replace(/^\D+/, '')

        // skip milestones that don't start with the target number
        if (!title.startsWith(shortenedTarget)) {
            continue
        }

        if (milestoneId === 0 || title < milestoneTitle) {
            context.log.info('Found milestone "' + milestone.title)
            milestoneId = milestone.number
            milestoneTitle = title
        }
    }

    return milestoneId
}

module.exports = async function(context, id, targets) {
    //TODO: Handle errors

    const commits = await getCommits(context)
    const token = await getToken(context.payload.installation.id)
    const pr = await pullRequest.getPR(context, id)
    const reviewers = await pullRequest.getReviewers(context)

    let labels = [];
    for (const label of pr.data.labels) {
        if (label.name === 'backport-request') {
            continue
        }

        // exclude labels that start with number followed by a dot (those are the Kanban labels)
        if (label.name.match(/^\d\./)) {
            continue
        }

        labels.push(label.name)
    }

    reviewers.push(pr.data.user.login)

    const milestones = await context.github.issues.listMilestonesForRepo(context.repo())

    let success = true

    for (const target of targets) {
        let newPrId = -1
        try {
            // Create branch with provided cherry-picked commits
            const commitsList = target.commits.length > 0 ? target.commits : commits
            context.log.debug('Backporting commits', commitsList.join(', '))
            const branch = await git(context, token, commitsList, target.branch)

            // Open PR
            const newPR = await pullRequest.newReady(context, pr.data.number, pr.data.title, target.branch, branch)
            newPrId = newPR.data.number

            // Add labels
            await pullRequest.addLabels(context, labels, newPrId)

            // Set available milestone
            const milestoneId = getMilestoneIdForTarget(context, milestones, target.branch)
            if (milestoneId > 0) {
                await pullRequest.setMilestone(context, milestoneId, newPrId)
            }

            // Comment success
            await pullRequest.backportSuccess(context, target, newPrId)
        } catch (e) {
            context.log.debug(e)
            context.log.warn('Backport to ' + target.branch + ' failed')
            success = false
            pullRequest.backportFailed(context, target)
            continue
        }

        await pullRequest.requestReviewers(context, newPrId, reviewers)
    }

    return success
}
