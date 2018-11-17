const pr = require('./lib/pr.js')
const comment = require('./lib/comment.js')
const backport = require('./lib/backport.js')
const getCommits = require('./lib/commits.js')
const getToken = require('./lib/token.js')

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

    await comment.plusOne(payload.comment.id)

    // TODO: set label
    
    if (!(await pr.isMerged(context, payload.issue.number))) {
      app.log("PR is not yet merged just carry on")
      return
    }

  })

  app.on('pull_request.closed', async context => {
    const payload = context.payload
    const installationId = context.payload.installation.id

    const params = context.issue()
    const comments  = await context.github.issues.getComments(params)

    // Obtain all targets
    let targets = []
    for (const {body, id} of comments.data) {
      const target = comment.match(body)
      if (target !== false) {
        targets.push(target)
        await comment.plusOne(context, id)

        // TODO: Set label
      }
    }

    app.log(targets)
    const origPRnr = context.issue().number
    app.log(origPRnr)

    const token = await getToken(installationId)
    const commits = await getCommits(context);

    app.log(token)
    app.log(commits)

    for (const target of targets) {
      await backport(app.log, context, origPRnr, target, token, commits)
    }
    
    // TODO: Clear label
  })
}
