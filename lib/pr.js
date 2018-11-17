module.exports = {
    isMerged: async function(context, id) {
        const params = context.repo({number: id});
        const pr = await context.github.pullRequests.get(params)
        return (pr.data.merged === true)
    }
}