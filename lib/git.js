const simpleGit = require('simple-git')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const util = require('util')

module.exports = async function(context, token, commits, target) {
    // Get a clean folder
    const prefix = path.resolve(os.tmpdir(), 'backportbot-')
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
        await git.addConfig('user.email', 'backportbot[bot]@users.noreply.github.com')
        await git.addConfig('user.name', 'backportbot[bot]')
        await git.addConfig('commit.gpgsign', 'false')
        await git.addConfig('format.signoff', 'true')

        // TODO: check if target exists if not error out

        // Checkout new branch
        await git.checkout(target)
        await git.checkoutBranch(
            backportBranch,
            target
        )

        for (let i = 0; i < commits.length; i++) {
            await util.promisify(git.raw.bind(git))(
            [
                'cherry-pick',
                commits[i]
            ])
        }

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



