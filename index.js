const pr = require('./lib/pr.js')
const comment = require('./lib/comment.js')
const backport = require('./lib/backport.js')

module.exports = app => {
  app.on('issue_comment.created', async context => {
    const payload = context.payload

    if (!payload.issue.html_url.endsWith('pull/' + payload.issue.number)) {
      // Ignore normal issues
      app.log("NOT A PR!")
      return
    }

    const target = comment.match(payload.comment.body);
    if (target === false) {
      app.log('Ignore')
      return;
    }

    comment.plusOne(context, payload.comment.id)
    pr.addLabels(context, ['backport-request'], context.issue().number)

    if (!(await pr.isMerged(context, payload.issue.number))) {
      app.log("PR is not yet merged just carry on")
      return
    }

    const success = await backport(context, context.issue.number, [target])

    if (success) {
      pr.removeBackportRequestLabel(context)
    }
  })

  app.on('pull_request.closed', async context => {
    const params = context.issue()
    const comments  = await context.github.issues.getComments(params)

    // Obtain all targets
    let targets = []
    for (const {body, id} of comments.data) {
      const target = comment.match(body)
      if (target !== false) {
        targets.push(target)

        comment.plusOne(context, id)
        pr.addLabels(context, ['backport-request'], params.number)
      }
    }

    if (targets.length === 0) {
      app.log('Nothing to backport')
      return
    }

    const thisPR = await context.github.pullRequests.get(params)
    if (!thisPR.data.merged) {
      app.log('PR is not merged, but closed')
      return
    }

    //TODO filter same backport requests

    app.log(targets)
    const success = await backport(context, context.issue.number, targets)
    
    if (success) {
      pr.removeBackportRequestLabel(context)
    }
  })
}
