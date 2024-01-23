# Backportbot

The Backportbot is a GitHub bot designed to streamline the process of backporting pull requests or specific commits to older branches in the Nextcloud repository.
This bot aims to make it easier for contributors to maintain and support multiple versions of the software by automating the backporting process.

## Usage

The Backportbot responds to specific commands in GitHub comments. Here are the allowed commands:

- `/backport to <branch>`: Backport all of the pull request's commits to the specified branch.
- `/backport <commit1> to <branch>`: Backport the specified commit to the specified branch.
- `/backport <commit1> <commit2> to <branch>`: Backport multiple commits to the specified branch.
- `/backport! to <branch>`: Trigger the backport request instantly without waiting for the pull request to be merged.

### Examples:

1. `/backport to stable28`: Backport all of the PR's commits to the stable28 branch.
2. `/backport abc456def to stable28`: Backport the commit with hash abc456def to the stable28 branch.
3. `/backport abc456def 123ghi789 to stable28`: Backport both commit abc456def and 123ghi789 to the stable28 branch.
4. `/backport! to stable28`: Trigger the backport request instantly without waiting for PR to be merged.

## How it Works

The Backportbot monitors GitHub comments for the specified commands. When triggered and approved, it will wait for the PR to be merged and automatically create backport requests to the specified branches. In case of duplicates branches in the commands, the most recent one will always be used and the other dropped.

### Reactions and their meanings

- 👀 The command is valid and the bot is waiting for the PR to be merged
- 😕 The command is not valid
- 👍 The bot started processing that comment/request
- 👎 The bot failed to execute tha backport. A comment with steps and additional informations on the failure will also be added.

## Contribution

Feel free to contribute to the development of the Backportbot. If you encounter issues or have ideas for improvement, please open an issue or submit a pull request.

Let's make maintaining Nextcloud across different branches more efficient with the help of the Backportbot!