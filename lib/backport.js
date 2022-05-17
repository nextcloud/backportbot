const git = require('./git.js')
const getToken = require('./token.js')
const pullRequest = require('./pr.js')

function getMilestoneIdForTarget (context, milestones, branch, logger) {
  logger.debug('Searching milestone for target ', branch)

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
      logger.debug('Found milestone', milestone.title)
      milestoneId = milestone.number
      milestoneTitle = title
    }
  }

  return milestoneId
}

/**
 * Backport commits to a different branch
 *
 * @param {Object} context the event context
 * @param {Array} targets the branch targets
 * @param {Object} logger app logger
 */
module.exports = async function (context, targets, logger) {
  // TODO: Handle errors
  const pr = await pullRequest.getPR(context)
  const oldBranch = await pullRequest.getBranch(context)
  logger.info('Starting backport from', oldBranch, 'to', targets.map(target => target.branch).join(', '))

  const token = await getToken(context.payload.installation.id)
  const commits = await pullRequest.getCommits(context)
  const reviewers = await pullRequest.getReviewers(context)

  let labels = []
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
  logger.debug('Label list: ', labels.join(', '))

  reviewers.push(pr.data.user.login)
  logger.debug('Reviewers list: ', reviewers.join(', '))

  const milestones = await context.github.issues.listMilestonesForRepo(context.repo())
  let success = true

  for (const target of targets) {
    let newPrId = -1
    try {
      // Create branch with provided cherry-picked commits
      const commitsList = target.commits.length > 0 ? target.commits : commits
      logger.debug('Backporting commits', commitsList.join(', '), 'to', target.branch)

      const branch = await git(context, token, commitsList, target.branch, logger)

      // Open PR
      const newPR = await pullRequest.newReady(context, pr.data.number, pr.data.title, target.branch, branch)
      newPrId = newPR.data.number

      // Add labels
      await pullRequest.addLabels(context, labels, newPrId)

      // Check conflicts
      const oldChanges = await pullRequest.getChanges(context)
      const newChanges = await pullRequest.getChanges(context, newPrId)
      const conflicts = oldChanges.additions !== newChanges.additions || oldChanges.deletions !== newChanges.deletions
      logger.debug('Checking conflicts', oldChanges, newChanges)
      if (conflicts) {
        logger.warn('Conflicts when cherry-picking from', oldBranch, 'to branch', branch)
        await pullRequest.updatePRBody(context, newPrId, `- [ ] :warning: This backport had conflicts and is incomplete\n\nbackport of #${pr.data.number}`)
      }

      // Set available milestone
      const milestoneId = getMilestoneIdForTarget(context, milestones, target.branch, logger)
      if (milestoneId > 0) {
        await pullRequest.setMilestone(context, milestoneId, newPrId)
      }

      logger.info('Successfully created backport from', oldBranch, 'for', target.branch, 'in', branch)
    } catch (e) {
      logger.debug(e)
      logger.error('Backport to', target.branch, 'failed')
      success = false
      pullRequest.backportFailed(context, target)
      continue
    }

    await pullRequest.requestReviewers(context, newPrId, reviewers)
  }

  return success
}
