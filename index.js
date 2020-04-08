const commands = require('probot-commands')
const pr = require('./lib/pr.js')
const comment = require('./lib/comment.js')
const backport = require('./lib/backport.js')

module.exports = app => {
  const logger = app.log

  // Register the backport comment command
  commands(app, 'backport', async (context, command) => {
    const payload = context.payload
    const issueId = pr.getNumber(context)

    // PR checks
    if (!payload.issue.html_url.endsWith('pull/' + issueId)) {
      // Ignore normal issues
      logger.info('This is not a PR', command)
      comment.minusOne(context, payload.comment.id)
      return
    }

    // match the comment
    const target = comment.match(command.arguments)
    if (target === false) {
      logger.info('Invalid target', command)
      comment.minusOne(context, payload.comment.id)
      return
    }

    if (!(await pr.isMerged(context, issueId))) {
      // Pr have been closed but not merged
      if (await pr.isClosed(context, issueId)) {
        logger.info('PR is not merged, but closed', issueId)
        comment.minusOne(context, payload.comment.id)
        return
      }

      // Pr still opened but not merged, let's wait for closure
      logger.info('PR is not yet merged just carry on')
      comment.eyes(context, payload.comment.id)

      pr.addLabels(context, ['backport-request'], issueId)
      return
    }

    // Pr is merged AND closed, let's backport !
    comment.plusOne(context, payload.comment.id)
    pr.addLabels(context, ['backport-request'], issueId)

    const success = await backport(context, [target], logger)

    if (success) {
      pr.removeBackportRequestLabel(context)
    } else {
      comment.confused(context, payload.comment.id)
    }
  })

  // On pr close
  app.on('pull_request.closed', async context => {
    const payload = context.payload
    const issueId = payload.pull_request && payload.pull_request.number

    if (!issueId) {
      logger.error('Invalid pull request', payload.pull_request)
      return
    }

    const params = context.issue()
    const comments = await context.github.issues.listComments(params)

    // Pr have been closed but not merged
    if (!(await pr.isMerged(context, issueId))) {
      logger.info('PR is not merged, but closed', issueId)
      return
    }

    // Obtain all targets and only keep the
    // last one to avoid duplicates
    let targets = {}
    for (const { body, commentId } of comments.data) {
      const target = comment.match(body)
      if (target !== false) {
        targets[target.branch] = target

        comment.plusOne(context, commentId)
        pr.addLabels(context, ['backport-request'], issueId)
      }
    }

    if (Object.values(targets).length === 0) {
      logger.info('Nothing to backport in pr', issueId)
      return
    }

    const success = await backport(context, Object.values(targets), logger)

    if (success) {
      pr.removeBackportRequestLabel(context)
    }
  })
}
