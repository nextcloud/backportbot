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

    setMilestone: async function(context, milestone, PrId) {
        const params = context.issue({
            number: PrId,
            milestone: milestone
        })
        return context.github.issues.update(params)
    },

    addLabels: async function(context, labels, PrId) {
        const params = context.issue({
            number: PrId,
            labels: labels
        })
        return context.github.issues.addLabels(params)
    },

    removeBackportRequestLabel: async function(context) {
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

    askForBackports: async function(context, target, prId) {
        return context.github.issues.createComment(
            context.issue({
                body: 'Should this be backported?'
            })
        )
    },

    getReviewers: async function(context) {
        const reviewers1 = await context.github.pullRequests.listReviewRequests(context.issue())
        const reviewers2 = await context.github.pullRequests.listReviews(context.issue())

        const reviewIds1 = reviewers1.data.users.map(reviewer => reviewer.login)
        const reviewIds2 = reviewers2.data.map(reviewer => reviewer.user.login)

        return reviewIds1.concat(reviewIds2)
    },

    requestReviewers: async function(context, prId, reviewers) {
        const params = context.repo({
            number: prId,
            reviewers: reviewers
        })

        return context.github.pullRequests.createReviewRequest(params);
    }
}
