module.exports = {
  /**
   * Get the pr or issue number
   * @param {Object} context github context
   */
  getNumber: function (context) {
    // depends if the payload is a pr or an issue
    return context.payload.issue
      ? context.payload.issue.number
      : context.payload.pull_request.number
  },

  isMerged: async function (context) {
    const pr = await this.getPR(context)
    return pr.data.merged === true
  },

  isClosed: async function (context) {
    const pr = await this.getPR(context)
    return pr.data.state === 'closed'
  },

  getBranch: async function (context) {
    const pr = await this.getPR(context)
    return pr.data.head.ref
  },

  getHeadSlug: async function (context) {
    const pr = await this.getPR(context)
    return pr.data.head.repo.full_name
  },

  getPR: async function (context) {
    // depends if the payload is a pr or an issue
    const number = this.getNumber(context)
    const params = context.repo({ pull_number: number })
    return context.github.pulls.get(params)
  },

  getCommits: async function (context) {
    const params = context.issue()
    const commits = await context.github.pulls.listCommits(params)
    return commits.data.map(function (commit) {
      return commit.sha
    })
  },

  getFiles: async function (context, issueId) {
    const number = this.getNumber(context)
    const params = !issueId
      ? context.repo({ pull_number: number })
      : context.repo({
        pull_number: issueId
      })
    const files = await context.github.pulls.listFiles(params)
    return files.data
  },

  newReady: async function (context, origPRnr, origPRTitle, target, targetBranch) {
    const params = context.repo({
      title: '[' + target + '] ' + origPRTitle,
      head: targetBranch,
      base: target,
      body: 'backport of #' + origPRnr
    })
    return context.github.pulls.create(params)
  },

  setMilestone: async function (context, milestone, issueId) {
    const params = context.issue({
      issue_number: issueId,
      milestone: milestone
    })
    return context.github.issues.update(params)
  },

  addLabels: async function (context, labels, issueId) {
    const params = context.issue({
      issue_number: issueId,
      labels: labels
    })
    return context.github.issues.addLabels(params)
  },

  removeBackportRequestLabel: async function (context) {
    const params = context.issue({
      name: 'backport-request'
    })
    return context.github.issues.removeLabel(params)
  },

  backportFailed: async function (context, target) {
    return context.github.issues.createComment(
      context.issue({
        body: 'The backport to ' + target.branch + ' failed. Please do this backport manually.'
      })
    )
  },

  backportSuccess: async function (context, target, issueId, conflicts) {
    let body = 'backport to ' + target.branch + ' in #' + issueId

    if (conflicts) {
      body += ' with conflicts :warning: '
    }
    return context.github.issues.createComment(
      context.issue({
        body: body
      })
    )
  },

  getReviewers: async function (context) {
    const reviewers1 = await context.github.pulls.listReviewRequests(context.issue())
    const reviewers2 = await context.github.pulls.listReviews(context.issue())

    const reviewIds1 = reviewers1.data.users.map(reviewer => reviewer.login)
    const reviewIds2 = reviewers2.data.map(reviewer => reviewer.user.login)

    return reviewIds1.concat(reviewIds2)
  },

  requestReviewers: async function (context, issueId, reviewers) {
    const params = context.repo({
      pull_number: issueId,
      reviewers: reviewers
    })

    return context.github.pulls.createReviewRequest(params)
  }
}
