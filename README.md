# backport

> A GitHub App built with [Probot](https://github.com/probot/probot) that A probot app that tries to do automatic backports

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Usage

The backport bot listens for comments to pull requests (PRs) on Github Nextcloud projects. To request a backport of a PR to a particular branch (`stable24` in this example), simply comment on the PR with the following syntax. A single comment is needed for each target branch.

```
/backport to stable24
```

Additionally you can also only backport a single or some commits of a pull request. This can be done by specifying the commit hashes:

```
# Single commit
/backport 12345678 to stable24

# Multiple commits
/backport 12345678,abcdef12,fedcba21 to stable24
```

## Contributing

If you have suggestions for how backport could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2018 Roeland Jago Douma <roeland@famdouma.nl> (https://rullzer.com)
