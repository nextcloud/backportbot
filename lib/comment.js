module.exports = {
    match: function (comment) {
        // Check for the command
        const command = /^\/backport to ([a-zA-Z0-9]+)$/im
        const match = command.exec(comment)
        if (match === null) {
            return false
        }
        return match[1]
    },

    plusOne: async function(context, commentId) {
        const params = context.repo({content: '+1', comment_id: commentId});
        await context.github.reactions.createForIssueComment(params);
    }
}