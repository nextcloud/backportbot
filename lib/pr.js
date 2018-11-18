module.exports = {
    isMerged: async function(context, id) {
        const params = context.repo({number: id});
        const pr = await context.github.pullRequests.get(params)
        return (pr.data.merged === true)
    },

    newReady: async function(log, context, origPRnr, origPRTitle, target, targetBranch) {
        const params = context.repo({
            title: '[' + target + '] ' + origPRTitle,
            head: targetBranch,
            base: target,
            body: 'backport of #' + origPRnr
        })
        return context.github.pullRequests.create(params)
    }
}