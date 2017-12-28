This is a GitHub REST API Object Oriented abstraction for JavaScript. This is still an experiment (and therefore very incomplete). It depends on [octokit/node-github](octokit/node-github).

## Motivation

Convinience only. Using octokit/node-github:

```js
let res = await github.repos.getForUser({username: "rxaviers"});
// Get next pages...
let repos = flatten(pages.map(res => res.data));
```

Using node-github-oo:

```js
let user = new User({login: "rxaviers"});
let repos = await user.getRepos();
```

