module.exports = async function (context) {
    const params = context.issue()
    const commits = await context.github.pullRequests.getCommits(params);

    return commits.data.map(function(commit) {
        return commit.sha
    })
}