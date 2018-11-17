const simpleGit = require('simple-git')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')

module.exports = {
    init: async function(log, context, token, commits, target) {
        log("FOO")
        log(os.tmpdir())

        // Get a clean folder
        const gitRoot = path.resolve(os.tmpdir(), 'backportbot', context.id)
        await fs.mkdir(gitRoot, {recursive: true})
        await fs.remove(gitRoot)
        await fs.mkdir(gitRoot)

        // Clone
        const slug = context.repo().owner + '/' + context.repo().repo
        const git = simpleGit(gitRoot)
        await git.clone('https://x-access-token:' + token + '@github.com/' + slug + '.git', '.')

        // TODO: check if target exists if not error out

        // Checkout new branch
        await git.checkout(target)
        const backportBranch = 'backport/' + context.issue().number + '/' + target
        await git.checkoutBranch(
            backportBranch,
            target
        )

        commits.forEach(commit => {
            git.raw([
                'cherry-pick',
                commit
            ])
        });

        await git.push('origin', backportBranch)
    }
}



