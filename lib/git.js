const simpleGit = require('simple-git')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')

module.exports = async function(context, token, commits, target) {
    // Get a clean folder
    const prefix = path.resolve(os.tmpdir(), 'backportbot', 'tmp-git')
    const gitRoot = await fs.mkdtemp(prefix)
    await fs.mkdir(gitRoot, {recursive: true})
    await fs.remove(gitRoot)
    await fs.mkdir(gitRoot)

    const backportBranch = 'backport/' + context.issue().number + '/' + target

    try {
        // Clone
        const slug = context.repo().owner + '/' + context.repo().repo
        const git = simpleGit(gitRoot)
        await git.clone('https://x-access-token:' + token + '@github.com/' + slug + '.git', '.')

        // Setup config
        await git.addConfig('user.email', 'backportbot-noreply@rullzer.com')
        await git.addConfig('user.name', 'Backportbot')
        await git.addConfig('commit.gpgsign', 'false')

        // TODO: check if target exists if not error out

        // Checkout new branch
        await git.checkout(target)
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
    } catch (e) {
        // Something went wrong, cleanup
        fs.remove(gitRoot)
        throw e
    }

    // Cleanup
    fs.remove(gitRoot)

    return backportBranch
}



