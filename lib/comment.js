module.exports = {
    match: function (comment) {
        // Check for the command
        const command = /^\/backport to ([\d\w-._]+)$/im
        const match = command.exec(comment)
        if (match === null) {
            return false
        }
        return match[1]
    },

    plusOne: async function(context, commentId) {
        const params = context.repo({content: '+1', comment_id: commentId});
        return context.github.reactions.createForIssueComment(params);
    }
}
