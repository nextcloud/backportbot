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
      const isCherryPicked = target.commits.length > 0
      const commitsList = isCherryPicked ? target.commits : commits
      logger.debug('Backporting commits', commitsList.join(', '), 'to', target.branch)

      const { backportBranch, conflicts, hasSkipCi } = await git(context, token, commitsList, target.branch, logger)

      // Open PR
      const newPR = await pullRequest.newReady(context, pr.data.number, pr.data.title, target.branch, backportBranch, conflicts)
      newPrId = newPR.data.number

      // Compare diffs
      const oldChanges = await pullRequest.getChanges(context)
      const newChanges = await pullRequest.getChanges(context, newPrId)
      const diffChanges = oldChanges.additions !== newChanges.additions || oldChanges.deletions !== newChanges.deletions
      logger.debug('Comparing diffs', oldChanges, newChanges)

      // Add labels
      await pullRequest.addLabels(context, labels, newPrId)

      if (conflicts) {
        logger.warn('Conflicts when cherry-picking from ' + oldBranch + ' to branch ' + backportBranch + ' prevented with --strategy=ours')
        let prDescription = `Backport of #${pr.data.number}

:warning: This backport had conflicts that were resolved with the 'ours' merge strategy and is likely incomplete.

## Todo
- [ ] Review and resolve any conflicts

---

Learn more about backports at https://docs.nextcloud.com/server/stable/go.php?to=developer-backports.
`
        if (hasSkipCi) {
          prDescription += `- [ ] Amend HEAD commit to remove '[skip ci]'`
        }
        await pullRequest.updatePRBody(context, newPrId, prDescription)
      } else if (!isCherryPicked && diffChanges) {
        logger.warn('Diff changes when cherry-picking from ' + oldBranch + ' to branch ' + backportBranch)
        await pullRequest.updatePRBody(context, newPrId, `Backport of #${pr.data.number}

:warning: This backport's changes differ from the original and might be incomplete

## Todo
- [ ] Review and resolve any conflicts

---

Learn more about backports at https://docs.nextcloud.com/server/stable/go.php?to=developer-backports.
        `)
      }

      // Set available milestone
      const milestoneId = getMilestoneIdForTarget(context, milestones, target.branch, logger)
      if (milestoneId > 0) {
        await pullRequest.setMilestone(context, milestoneId, newPrId)
      }

      logger.info('Successfully created backport from', oldBranch, 'for', target.branch, 'in', backportBranch)
    } catch (e) {
      logger.error('Backport to', target.branch, 'failed')
      logger.error(e)
      success = false
      pullRequest.backportFailed(context, target)
      continue
    }

    await pullRequest.requestReviewers(context, newPrId, reviewers)
  }

  return success
}
