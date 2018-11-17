const simpleGit = require('simple-git')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')

/*
 * TODO: 
 *  + pass in repo etc properly
 */
module.exports = async function(log, context, token, commits, target) {
    // Get a clean folder
    const prefix = path.resolve(os.tmpdir(), 'backportbot', 'tmp-git')
    const gitRoot = await fs.mkdtemp(prefix)
    await fs.mkdir(gitRoot, {recursive: true})
    await fs.remove(gitRoot)
    await fs.mkdir(gitRoot)

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

    // Cleanup
    fs.remove(gitRoot)

    return backportBranch
}



