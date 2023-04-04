const simpleGit = require('simple-git/promise')
const os = require('os')
const path = require('path')
const fs = require('fs-extra')
const pr = require('./pr')

module.exports = async function (context, token, commits, target, logger) {
  // Get a clean folder
  const prefix = path.resolve(os.tmpdir(), 'backportbot-')
  const gitRoot = await fs.mkdtemp(prefix)
  await fs.mkdir(gitRoot, { recursive: true })
  await fs.remove(gitRoot)
  await fs.mkdir(gitRoot)

  const number = pr.getNumber(context)
  const backportBranch = 'backport/' + number + '/' + target
  let conflicts = false
  try {
    // Clone
    const slug = context.repo().owner + '/' + context.repo().repo
    const git = simpleGit(gitRoot)
    await git.clone('https://x-access-token:' + token + '@github.com/' + slug + '.git', '.')

    // Setup config
    await git.addConfig('user.email', 'backportbot-nextcloud[bot]@users.noreply.github.com')
    await git.addConfig('user.name', 'backportbot-nextcloud[bot]')
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
      logger.debug('Cherry picking', commits[i])
      // Cherry picking commits while discarding conflicts
      try {
        await git.raw([
          'cherry-pick',
          commits[i],
        ])
      } catch (error) {
        conflicts = true
        logger.error('Cherry-pick failed. Abort and try with --strategy-option=ours', error)
        await git.raw([
          'cherry-pick',
          '--abort',
        ])

        await git.raw([
          'cherry-pick',
          commits[i],
          '--strategy-option',
          'ours'
        ], (err, result) => {
          logger.info(err, result)
        })
      }
    }

    logger.debug('Pushing to', backportBranch)
    await git.push('origin', backportBranch)
  } catch (e) {
    // Something went wrong, cleanup
    fs.remove(gitRoot)
    throw e
  }

  // Cleanup
  fs.remove(gitRoot)

  return {
    backportBranch,
    conflicts,
  }
}
