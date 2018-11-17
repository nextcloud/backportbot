const getCommits = require('./lib/commits.js')
const git = require('./lib/git.js')
const githubApp = require('github-app')


module.exports = app => {
  app.on('issue_comment.created', async context => {
    const payload = context.payload

    if (!payload.issue.html_url.endsWith('pull/' + payload.issue.number)) {
      // Ignore normal issues
      app.log("NOT A PR!")
      return
    }

    // Check for the command
    const command = /^\/backport to ([a-zA-Z0-9]+)$/im
    const match = command.exec(payload.comment.body)
    if (match === null) {
      app.log("Not for us")
      return;
    }

    // +1 the request
    {
      const params = context.repo({content: '+1', comment_id: payload.comment.id});
      await context.github.reactions.createForIssueComment(params);
    }

    // Check if the PR is merged already
    const params = context.repo({number: payload.issue.number});
    const pr = await context.github.pullRequests.get(params)

    if (pr.data.merged === true) {
      app.log("PR IS MERGED LETS DO THE BACKPORT!")
      return
    }

    app.log("PR NOT YET MERGED lets wait till it is merged")
  })

  app.on('pull_request.closed', async context => {
    const payload = context.payload
    const installationId = context.payload.installation.id

    const auth = githubApp({
      id: process.env.APP_ID,
      cert: process.env.PRIVATE_KEY
    })
    const token = await auth.createToken(installationId)

    app.log(token)

    const params = context.issue()
    const comments  = await context.github.issues.getComments(params)

    for (const {body} of comments.data) {
      app.log(body)
    }

    const commits = await getCommits(context)
    app.log(commits)

    const branch = await git(app.log, context, token.data.token, commits, 'stable14')
    
  })
}
