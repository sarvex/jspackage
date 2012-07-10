fs = require('fs')
path = require('path')
async = require('async')

cached_files = {}
root = null
options = null

parseFile = (resolved_dep, cb) ->
  file =
    path: resolved_dep.path
    compiled_js: null
    mtime: null
    deps: []
  fs.stat resolved_dep.path, (err, stat) ->
    if err
      cb err
      return
    file.mtime = +stat.mtime
    fs.readFile resolved_dep.path, 'utf8', (err, source) ->
      if err
        cb err
        return
      parser = extensions[path.extname(resolved_dep.path)]
      try
        file.compiled_js = parser.compile(source, resolved_dep.options)
      catch err
        cb "#{resolved_dep.path}\n#{err}", file
        return
      if options.watch
        timestamp = (new Date()).toLocaleTimeString()
        console.info "#{timestamp} - compiled #{file.path}"
      # get the list of dependencies
      re = parser.depend_re
      re.lastIndex = 0
      while result = re.exec(source)
        depend = result[1]
        options = {bare: result[2]?}
        file.deps.push {depend, options}
      cb null, file


resolveDepend = (cwd, dep, doneResolvingDepend) ->
  # try each of the supported extensions
  try_exts = Object.keys(extensions)
  # try each of the libs, but stop upon first success
  lib_index = 0
  tryNextLib = ->
    if (try_lib = libs[lib_index++])?
      resolveWithExt = (ext, cb) ->
        resolved_path = path.resolve(cwd, try_lib, dep.depend + ext)
        fs.realpath resolved_path, (err, real_path) ->
          if err
            cb null, null
            return
          fs.stat real_path, (err, stat) ->
            if err or stat.isDirectory()
              cb null, null
            else
              cb null, real_path
      async.map try_exts, resolveWithExt, (err, results) ->
        async.filter results, ((item, cb) -> cb(item?)), (results) ->
          if results.length is 1
            doneResolvingDepend null, {path: results[0], options: dep.options}
          else if results.length is 0
            tryNextLib()
          else if results.length > 1
            doneResolvingDepend("ambiguous dependency: #{dep.depend}")
          return
    else
      doneResolvingDepend("unable to resolve dependency: #{dep.depend}")
  tryNextLib()
  
resolveDependencyChain = (root, doneResolvingDependencyChain) ->
  files = []
  seen = {}
  processNode = (node, doneProcessingNode) ->
    resolveFromDep = (dep, cb) ->
      resolveDepend(path.dirname(node.path), dep, cb)
    async.map node.deps, resolveFromDep, (err, resolved_deps) ->
      if err
        doneResolvingDependencyChain err
        return
      funcs = []
      for dep in resolved_deps
        file = cached_files[dep.path]
        if seen[file.path]?
          continue
        seen[file.path] = true
        funcs.push async.apply(processNode, file)
      async.parallel funcs, (err, results) ->
        if err
          doneResolvingDependencyChain err
          return
        files.push node
        doneProcessingNode()
  processNode root, ->
    doneResolvingDependencyChain null, files

collectDependencies = (cwd, dep, doneCollectingDependencies) ->
  resolveDepend cwd, dep, (err, resolved_dep) ->
    if err
      doneCollectingDependencies(err)
      return

    parseAndHandleErr = (cb) ->
      parseFile resolved_dep, (err, file) ->
        if file
          cached_files[file.path] = file
          root ?= file

        if err
          doneCollectingDependencies(err)
        else
          cb(file)

        return

    callNext = (file) ->
      collectFromFile = (dep, cb) ->
        collectDependencies(path.dirname(file.path), dep, cb)
      async.map file.deps, collectFromFile, doneCollectingDependencies

    if (cached_file = cached_files[resolved_dep.path])?
      fs.stat resolved_dep.path, (err, stat) ->
        if cached_file.mtime is +stat.mtime
          root ?= cached_file
          callNext cached_file
        else
          parseAndHandleErr callNext
    else
      parseAndHandleErr callNext


# emulates fs.watch
watchFileFallback = (filename, options, cb) ->
  options.interval = 701
  fs.watchFile filename, options, (curr, prev) ->
    if curr.mtime isnt prev.mtime
      cb "change", filename
  return {close: -> fs.unwatchFile(filename)}

watchFile = fs.watch or watchFileFallback

watchFiles = (files, cb) ->
  watchers = []
  doCallback = (event) ->
    if event is "change"
      watcher.close() for watcher in watchers
      cb()
  for file in files
    try
      watcher = fs.watch(file, doCallback)
    catch err
      watcher = watchFileFallback(file, doCallback)
    watchers.push watcher

libs = null
compile = (_options, cb) ->
  options = _options

  libs = options.libs ? []
  libs = (path.resolve(lib) for lib in libs)
  libs.unshift "."

  root = null
  dep =
    depend: options.mainfile
    options:
      bare: options.bare
  collectDependencies process.cwd(), dep, (collect_err) ->
    if collect_err and not root?
      cb(collect_err)
      return
    resolveDependencyChain root, (err, dependency_chain) ->
      if _options.watch
        watchFiles (dep.path for dep in dependency_chain), ->
          compile _options, cb
      if err
        cb(err)
      else if collect_err
        cb(collect_err)
      else
        output = (dep.compiled_js for dep in dependency_chain).join("\n")
        cb(null, output)
      return

extensions =
  '.coffee':
    compile: (code, options) ->
      require('coffee-script').compile code, bare: options.bare
    depend_re: /^#depend "(.+)"( bare)?$/gm

  '.js':
    compile: (code, options) ->
      if options.bare
        code
      else
        "(function(){\n#{code}}).call(this);"
    depend_re: /^\/\/depend "(.+)"( bare)?;?$/gm

  '.co':
    compile: (code, options) ->
      require('coco').compile code, bare: options.bare
    depend_re: /^#depend "(.+)"( bare)?$/gm

  '.ls':
    compile: (code, options) ->
      require('LiveScript').compile code, bare: options.bare
    depend_re: /^#depend "(.+)"( bare)?$/gm

module.exports = {compile, extensions}
