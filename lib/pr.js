module.exports = {
    isMerged: async function(context, id) {
        const params = context.repo({number: id});
        const pr = await context.github.pullRequests.get(params)
        return (pr.data.merged === true)
    },

    newReady: async function(context, origPRnr, origPRTitle, target, targetBranch) {
        const params = context.repo({
            title: '[' + target + '] ' + origPRTitle,
            head: targetBranch,
            base: target,
            body: 'backport of #' + origPRnr
        })
        return context.github.pullRequests.create(params)
    },

    addLabel: async function(context) {
        const params = context.issue({
            labels: ['backport-request']
        })
        return context.github.issues.addLabels(params)
    },

    removeLabel: async function(context) {
        const params = context.issue({
            name: 'backport-request'
        })
        return context.github.issues.removeLabel(params)
    },

    getPR: async function(context) {
        return context.github.pullRequests.get(context.issue())
    },

    backportFailed: async function(context, target) {
        return context.github.issues.createComment(
            context.issue({
                body: 'The backport to ' + target + ' failed. Please do this backport manually.'
            })
        )
    },

    backportSuccess: async function(context, target, prId) {
        return context.github.issues.createComment(
            context.issue({
                body: 'backport to ' + target + ' in #' + prId
            })
        )
    },

    getReviewers: async function(context) {
        const reviewers = await context.github.pullRequests.getReviewRequests(context.issue())
        return reviewers.data.users.map(reviewer => reviewer.id)
    },

    requestReviewers: async function(context, prId, reviewers) {
        const params = context.repo({
            number: prId,
            reviewers: reviewers
        })

        return context.github.pulls.createReviewRequest(params);
    }
}