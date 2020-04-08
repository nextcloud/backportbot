module.exports = {
    match: function (comment) {
        // Check for the command
        const command = /^\/backport ((?<commits>[a-f0-9,]*) )?to (?<branch>[\d\w-._]+)$/im
        const match = command.exec(comment)
        if (match === null) {
            return false
        }
        // minimum we want is a branch
        if (!match.groups.branch) {
            return false
        }

        const commits = match.groups.commits || ''
        return {
            branch: match.groups.branch,
            // filter invalid commits, we allow full commits or min 7 char hash
            commits: commits.split(',').filter(commit => !!commit && commit.length >= 7)
        }
    },

    plusOne: async function(context, commentId) {
        const params = context.repo({content: '+1', comment_id: commentId});
        return context.github.reactions.createForIssueComment(params);
    }
}
