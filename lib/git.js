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
  let hasSkipCi = false
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

        let originalCommitMessage = undefined
        try {
          const commitLog = await git.log({
            from: commits[i],
            to: `${commits[i]}~1`,
            multiLine: true,
          })
          originalCommitMessage = commitLog.latest.body
        } catch (error) {
          logger.error('Could not get original commit ' + commits[i] + ' from git log')
        }

        try {
          if (originalCommitMessage) {
            await git.raw([
              'cherry-pick',
              commits[i],
              '--strategy-option',
              'ours',
              '-e',
              originalCommitMessage + '\n\n[skip ci]'
            ])
          } else {
            await git.raw([
              'cherry-pick',
              commits[i],
              '--strategy-option',
              'ours'
            ])
          }
        } catch(error) {
          logger.error('Cherry-pick failed with --strategy-option=ours too', error)
          throw error
        }
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
    hasSkipCi
  }
}
