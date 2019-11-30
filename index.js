// @ts-check
const core = require('@actions/core')
const exec = require('@actions/exec')
const io = require('@actions/io')
const hasha = require('hasha')
const {
  restoreCache,
  saveCache
} = require('cache/lib/index')
const fs = require('fs')
const os = require('os')
const path = require('path')
const quote = require('quote')

const homeDirectory = os.homedir()

const workingDirectory =
  core.getInput('working-directory') || process.cwd()
const yarnFilename = path.join(
  workingDirectory,
  'yarn.lock'
)
const packageLockFilename = path.join(
  workingDirectory,
  'package-lock.json'
)
const useYarn = fs.existsSync(yarnFilename)
const lockFilename = useYarn
  ? yarnFilename
  : packageLockFilename
const lockHash = hasha.fromFileSync(lockFilename)
const platformAndArch = `${process.platform}-${process.arch}`

// enforce the same NPM cache folder across different operating systems
const NPM_CACHE_FOLDER = path.join(homeDirectory, '.npm')
const NPM_CACHE = (() => {
  const o = {}
  if (useYarn) {
    o.inputPath = path.join(homeDirectory, '.cache', 'yarn')
    o.primaryKey = o.restoreKeys = `yarn-${platformAndArch}-${lockHash}`
  } else {
    o.inputPath = NPM_CACHE_FOLDER
    o.primaryKey = o.restoreKeys = `npm-${platformAndArch}-${lockHash}`
  }
  return o
})()

const restoreCachedNpm = () => {
  console.log('trying to restore cached NPM modules')
  return restoreCache(
    NPM_CACHE.inputPath,
    NPM_CACHE.primaryKey,
    NPM_CACHE.restoreKeys
  )
}

const saveCachedNpm = () => {
  console.log('saving NPM modules')
  return saveCache(
    NPM_CACHE.inputPath,
    NPM_CACHE.primaryKey
  )
}

const install = () => {
  // Note: need to quote found tool to avoid Windows choking on
  // npm paths with spaces like "C:\Program Files\nodejs\npm.cmd ci"

  const options = {
    cwd: workingDirectory
  }

  if (useYarn) {
    console.log('installing NPM dependencies using Yarn')
    return io.which('yarn', true).then(yarnPath => {
      console.log('yarn at "%s"', yarnPath)
      return exec.exec(
        quote(yarnPath),
        ['--frozen-lockfile'],
        options
      )
    })
  } else {
    console.log('installing NPM dependencies')
    core.exportVariable(
      'npm_config_cache',
      NPM_CACHE_FOLDER
    )

    return io.which('npm', true).then(npmPath => {
      console.log('npm at "%s"', npmPath)
      return exec.exec(quote(npmPath), ['ci'], options)
    })
  }
}

const npmInstallAction = () => {
  return restoreCachedNpm().then(npmCacheHit => {
    console.log('npm cache hit', npmCacheHit)

    return install().then(() => {
      if (npmCacheHit) {
        return
      }

      return saveCachedNpm()
    })
  })
}

module.exports = {
  npmInstallAction
}

if (!module.parent) {
  console.log('running npm-install GitHub Action')
  npmInstallAction()
    .then(() => {
      console.log('all done, exiting')
    })
    .catch(error => {
      console.log(error)
      core.setFailed(error.message)
    })
}
