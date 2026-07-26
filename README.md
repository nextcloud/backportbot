# Backportbot

The Backportbot is a GitHub bot designed to streamline the process of backporting pull requests or specific commits to older branches in the Nextcloud repository.
This bot aims to make it easier for contributors to maintain and support multiple versions of the software by automating the backporting process.

## Usage

The Backportbot responds to `/backport` commands posted in pull-request comments.
Only repository collaborators and prior contributors can request a backport.

- `/backport to <branch>`: Backport all non-merge commits from the pull request to the specified branch.
- `/backport <commit> [<commit> ...] to <branch>`: Backport only the specified commit(s) to the specified branch.
- `/backport! to <branch>`: Immediately backport all non-merge commits, without waiting for the pull request to be merged.
- `/backport! <commit> [<commit> ...] to <branch>`: Immediately backport the specified commit(s).

### Examples

1. `/backport to stable28`: Backport all non-merge commits from the PR to the `stable28` branch.
2. `/backport abc456def to stable28`: Backport the commit with hash `abc456def` to the `stable28` branch.
3. `/backport abc456def 123456789 to stable28`: Backport both specified commits (`abc456def` and `123456789`) to the `stable28` branch.
4. `/backport! to stable28`: Immediately backport all non-merge commits from the PR to `stable28`.
5. `/backport! abc456def to stable28`: Immediately backport the specified commit (`abc456def`) to `stable28`.

## How it Works

The Backportbot monitors GitHub comments for the specified commands.

When triggered, the bot creates a backport pull request for the requested target branch and
commits.

A standard request made before merge waits until the original pull request is merged. The bot
then creates the backport pull request and requests reviews from eligible approved reviewers of
the original pull request, as well as its author.

A forced request (`/backport!`) runs immediately, without waiting for the original pull request
to be merged.

The bot cherry-picks the requested commits, pushes a `backport/<pr-number>/<target-branch>`
branch, and opens a pull request targeting the requested branch. Backports with conflicts are
opened as draft pull requests and include a warning.

If several non-forced requests target the same branch, the most recent valid request is used
when the original pull request is merged.

### Reactions and their meanings

- 👀 The request is valid and the bot is waiting for the PR to be merged.
- 😕 The bot could not parse the command.
- 👍 The backport request is being processed.
- 🎉 The backport completed successfully.
- 👎 The backport failed. The bot attempts to add manual backport instructions in a comment.

## Contribution

Feel free to contribute to the development of the Backportbot. If you encounter issues or have ideas for improvement, please open an issue or submit a pull request.

Let's make maintaining Nextcloud across different branches more efficient with the help of the Backportbot!
