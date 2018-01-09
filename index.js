/**
 * Array utils
 */
function flatten(array) {
  return array.reduce((acc, item) => {
    Array.isArray(item) ? acc.push(...item) : acc.push(item);
    return acc;
  }, []);
}

/**
 * Main class
 */
class Main {
  constructor(github, {debug = false} = {}) {
    this.github = github;

    /**
     * Connection utils
     */
    function _getAllPages({resArray, count}, res) {
      resArray.push(res);
      debug && console.log("- getNextPage", resArray.length);
      if (count && resArray.reduce((sum, res) => sum + res.data.length, 0) > count) {
        return resArray;
      }
      if (/rel="next"/.test(res.meta.link)) {
        return github.getNextPage(res).then(_getAllPages.bind(null, {resArray, count}));
      }
      return resArray;
    }

    function getAllPages(opts = {}) {
      return _getAllPages.bind(null, {...opts, resArray: []});
    }

    function retryOnConnectionIssues(cb) {
      return cb()
        .catch(error => {
          if (/ECONNRESET/.test(error.message)) {
            debug && console.log(`${error.message}, retrying...`);
            return cb();
          }
          throw error;
        });
    }

    /**
     * User class
     */
    class User {
      static getAll(opts) {
        debug && console.log("Fetching all users (this might take awhile)...");
        return github.users.getAll({since: 0})
          .then(getAllPages(opts))
          .then(resArray => {
            resArray = resArray.map(res => res.data);
            return flatten(resArray);
          })
          .then(usersProps => usersProps.map(userProps => new User(userProps)));
      }

      constructor(props) {
        Object.assign(this, props);
      }

      getRepos() {
        return Repo.getAll({user: this});
      }
    }

    /**
     * Repo class
     */
    class Repo {
      static getAll({user, otherProps}) {
        const username = user.login;
        debug && console.log(`Fetching all repos from user ${username}...`);
        return github.repos.getForUser({username})
          .then(getAllPages(otherProps))
          .then(resArray => {
            resArray = resArray.map(res => res.data);
            return flatten(resArray);
          })
          .then(reposProps => reposProps.map(repoProps => new Repo(repoProps, {user})));
      }

      constructor(props, {user}) {
        Object.assign(this, props);
        Object.defineProperty(this, "user", {get: () => user});
      }

      getBranch(branch) {
        return Branch.get({
          repo: this,
          user: this.user,
          branch
        });
      }

      getBranches() {
        return Branch.getAll({
          repo: this,
          user: this.user
        });
      }
    }

    /**
     * Branch class
     */
    class Branch {
      static get({user, repo, branch}) {
        const owner = user.login;
        return retryOnConnectionIssues(() => {
          return github.repos.getBranch({owner, repo: repo.name, branch})
            .then(res => res.data);
        })
        .then(props => new Branch(props, {user, repo}))
        .catch(error => {
          if (error.status === "Not Found") {
            return null;
          }
          throw error;
        });
      }

      static getAll({user, repo}) {
        const owner = user.login;
        debug && console.log(`Fetching all branches of ${owner}/${repo.name}...`);
        return github.repos.getBranches({owner, repo: repo.name})
          .then(getAllPages())
          .then(resArray => {
            resArray = resArray.map(res => res.data);
            return flatten(resArray);
          })
          .then(branchesProps => branchesProps.map(branchProps => new Branch(branchProps, {user, repo})));
      }

      constructor(props, {user, repo}) {
        Object.assign(this, props);
        Object.defineProperty(this, "user", {get: () => user});
        Object.defineProperty(this, "repo", {get: () => repo});
      }

      // optional parameters: `ref`.
      getContent({path, ...otherProps} = {}) {
        const repo = this.repo.name;
        const owner = this.user.login;
        return github.repos.getContent({owner, repo, path, ...otherProps})
          .then(res => {
            let data = res.data;
            if (data.content) {
              data.content = new Buffer(data.content, "base64").toString("utf8");
            }
            return data;
          });
      }

      getCommit({sha = this.commit.sha, ...otherProps} = {}) {
        sha = sha || this.commit.sha;
        const repo = this.repo.name;
        const owner = this.user.login;
        return github.repos.getCommit({owner, repo, sha, ...otherProps})
          .then(res => res.data);
      }

      getCommits({sha = this.commit.sha, ...otherProps} = {}) {
        sha = sha || this.commit.sha;
        const repo = this.repo.name;
        const owner = this.user.login;
        return github.repos.getCommits({owner, repo, sha, ...otherProps})
          .then(getAllPages(otherProps))
          .then(resArray => {
            resArray = resArray.map(res => res.data);
            return flatten(resArray);
          });
          // TODO .then(commitsProps => commitsProps.map(commitProps => new Commit(commitProps, {user, ...??})));
      }

      getTree({sha = this.commit.sha, recursive = false} = {}) {
        const repo = this.repo.name;
        const owner = this.user.login;
        return retryOnConnectionIssues(() => {
          return github.gitdata.getTree({owner, repo, sha, recursive})
            .then(res => res.data)
            .catch(error => {
              if (error.status === "Not Found") {
                return {};
              }
              throw error;
            });
        });
      }
    }

    this.User = User;
    this.Repo = Repo;
    this.Branch = Branch;
  }
}

module.exports = Main;
